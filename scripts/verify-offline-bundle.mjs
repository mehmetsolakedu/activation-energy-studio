#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import {
  createScanner,
  LanguageVariant,
  SyntaxKind,
} from 'typescript/unstable/ast';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const STYLE_EXTENSIONS = new Set(['.css', '.less', '.sass', '.scss']);

const NETWORK_CONSTRUCTORS = new Set([
  'EventSource',
  'RTCPeerConnection',
  'SharedWorker',
  'WebSocket',
  'WebTransport',
  'Worker',
  'XMLHttpRequest',
]);

const NETWORK_PACKAGES = new Set([
  'axios',
  'cross-fetch',
  'got',
  'isomorphic-fetch',
  'ky',
  'node-fetch',
  'superagent',
  'undici',
]);

const RESOURCE_CREATING_TAGS = new Set([
  'audio',
  'embed',
  'iframe',
  'img',
  'link',
  'object',
  'script',
  'source',
  'track',
  'video',
]);

const HTML_RESOURCE_ATTRIBUTES = [
  ['base[href]', 'href'],
  ['body[background]', 'background'],
  ['embed[src]', 'src'],
  ['frame[src]', 'src'],
  ['iframe[src]', 'src'],
  ['img[src]', 'src'],
  ['img[srcset]', 'srcset'],
  ['input[type="image"][src]', 'src'],
  ['link[href]', 'href'],
  ['object[data]', 'data'],
  ['script[src]', 'src'],
  ['source[src]', 'src'],
  ['source[srcset]', 'srcset'],
  ['track[src]', 'src'],
  ['video[poster]', 'poster'],
  ['video[src]', 'src'],
  ['audio[src]', 'src'],
  ['image[href]', 'href'],
  ['image[xlink\\:href]', 'xlink:href'],
  ['use[href]', 'href'],
  ['use[xlink\\:href]', 'xlink:href'],
];

function parseArguments(argv) {
  const options = {
    projectRoot: DEFAULT_PROJECT_ROOT,
    distDirectory: 'dist',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project-root') {
      options.projectRoot = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === '--dist') {
      options.distDirectory = requireValue(argv, ++index, argument);
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-offline-bundle.mjs [options]

Options:
  --project-root <path>  Project root (default: parent of scripts/)
  --dist <path>          Build directory, relative to project root or absolute
                         (default: dist)
  --json                 Print a machine-readable report
  -h, --help             Show this help

The verifier checks two separate claims:
  1. the build directory contains exactly one self-contained index.html; and
  2. first-party browser source contains no recognized network API use.
`);
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function toPortableRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function isEmbeddedReference(rawReference) {
  const reference = rawReference.trim();
  if (!reference) return false;
  return /^(?:data:|blob:|#|about:blank(?:#.*)?$)/i.test(reference);
}

function splitSrcset(rawSrcset) {
  // A srcset candidate separator is a comma followed by whitespace. This keeps
  // the comma inside a data URI intact while covering ordinary generated HTML.
  return rawSrcset
    .split(/,\s+/)
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function collectCssReferences(cssText) {
  const references = [];
  const importPattern = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/gi;
  const urlPattern = /url\(\s*(?:["']([^"']+)["']|([^"')]+))\s*\)/gi;

  for (const match of cssText.matchAll(importPattern)) {
    references.push({ kind: '@import', value: match[1] });
  }
  for (const match of cssText.matchAll(urlPattern)) {
    references.push({ kind: 'url()', value: (match[1] ?? match[2]).trim() });
  }
  return references;
}

function inspectBuiltHtml(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const violations = [];

  for (const [selector, attribute] of HTML_RESOURCE_ATTRIBUTES) {
    for (const element of document.querySelectorAll(selector)) {
      const rawValue = element.getAttribute(attribute) ?? '';
      const references = attribute === 'srcset' ? splitSrcset(rawValue) : [rawValue];
      for (const reference of references) {
        if (!isEmbeddedReference(reference)) {
          violations.push(`${element.tagName.toLowerCase()}[${attribute}]=${JSON.stringify(reference)}`);
        }
      }
    }
  }

  for (const meta of document.querySelectorAll('meta[http-equiv]')) {
    if ((meta.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'refresh') {
      violations.push(`meta[http-equiv=refresh]=${JSON.stringify(meta.getAttribute('content') ?? '')}`);
    }
  }

  const cssBlocks = [
    ...[...document.querySelectorAll('style')].map((element) => element.textContent ?? ''),
    ...[...document.querySelectorAll('[style]')].map((element) => element.getAttribute('style') ?? ''),
  ];
  for (const cssText of cssBlocks) {
    for (const reference of collectCssReferences(cssText)) {
      if (!isEmbeddedReference(reference.value)) {
        violations.push(`CSS ${reference.kind}=${JSON.stringify(reference.value)}`);
      }
    }
  }

  const moduleSpecifierPatterns = [
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g,
  ];
  for (const script of document.querySelectorAll('script:not([src])')) {
    const scriptText = script.textContent ?? '';
    for (const pattern of moduleSpecifierPatterns) {
      for (const match of scriptText.matchAll(pattern)) {
        if (!isEmbeddedReference(match[1])) {
          violations.push(`inline module import=${JSON.stringify(match[1])}`);
        }
      }
    }
  }

  return {
    violations: [...new Set(violations)].sort(),
    inlineScriptCount: document.querySelectorAll('script:not([src])').length,
    inlineStyleCount: document.querySelectorAll('style').length,
  };
}

function packageRoot(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function isRemoteModuleSpecifier(specifier) {
  return /^(?:https?:|wss?:|\/\/)/i.test(specifier);
}

const EXPRESSION_END_TOKENS = new Set([
  SyntaxKind.Identifier,
  SyntaxKind.PrivateIdentifier,
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.ThisKeyword,
  SyntaxKind.SuperKeyword,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
]);

function slashStartsRegularExpression(previousKind) {
  if (previousKind === undefined) return true;
  // In TSX, a slash immediately following "<" starts a closing element.
  if (previousKind === SyntaxKind.LessThanToken) return false;
  return !EXPRESSION_END_TOKENS.has(previousKind);
}

function scanSourceTokens(sourceText, filePath) {
  const scanner = createScanner(true, LanguageVariant.JSX, sourceText);
  const tokens = [];
  const templateStack = [];
  const maximumTokenCount = Math.max(1_000, sourceText.length * 4);

  const pushCurrentToken = (kind) => {
    const token = {
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
    };
    if (token.end <= token.start) {
      const tail = tokens.slice(-8).map((previous) => (
        `${SyntaxKind[previous.kind]}@${previous.start}-${previous.end}:${JSON.stringify(previous.text)}`
      )).join(', ');
      throw new Error(
        `Source-token scan made no progress for ${filePath} at ${token.start} (${SyntaxKind[kind]}); prior tokens: ${tail}`,
      );
    }
    tokens.push(token);
  };

  while (true) {
    if (tokens.length > maximumTokenCount) {
      const tail = tokens.slice(-8).map((token) => (
        `${SyntaxKind[token.kind]}@${token.start}-${token.end}:${JSON.stringify(token.text)}`
      )).join(', ');
      throw new Error(
        `Source-token scan did not converge for ${filePath} after ${tokens.length} tokens; tail: ${tail}`,
      );
    }
    let kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    if (
      (kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken)
      && slashStartsRegularExpression(tokens.at(-1)?.kind)
    ) {
      kind = scanner.reScanSlashToken();
    }
    pushCurrentToken(kind);

    if (kind === SyntaxKind.TemplateHead) {
      templateStack.push({ braceDepth: 0 });
    } else if (templateStack.length > 0 && kind === SyntaxKind.OpenBraceToken) {
      templateStack.at(-1).braceDepth += 1;
    } else if (templateStack.length > 0 && kind === SyntaxKind.CloseBraceToken) {
      const activeTemplate = templateStack.at(-1);
      if (activeTemplate.braceDepth > 0) {
        activeTemplate.braceDepth -= 1;
      } else {
        const templateKind = scanner.reScanTemplateToken(false);
        pushCurrentToken(templateKind);
        if (templateKind === SyntaxKind.TemplateTail) {
          templateStack.pop();
        }
      }
    }
  }

  return tokens;
}

function sourceLocation(sourceText, position) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < position; index += 1) {
    if (sourceText.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function isStringToken(token) {
  return token?.kind === SyntaxKind.StringLiteral
    || token?.kind === SyntaxKind.NoSubstitutionTemplateLiteral;
}

function dottedPathEndingAt(tokens, index) {
  const parts = [tokens[index].text];
  let cursor = index - 1;
  while (
    cursor >= 1
    && (tokens[cursor].kind === SyntaxKind.DotToken || tokens[cursor].kind === SyntaxKind.QuestionDotToken)
  ) {
    parts.unshift(tokens[cursor - 1].text);
    cursor -= 2;
  }
  return parts.join('.');
}

function inspectSourceFile(filePath, projectRoot) {
  const sourceText = readFileSync(filePath, 'utf8');
  const tokens = scanSourceTokens(sourceText, toPortableRelative(projectRoot, filePath));
  const violations = new Set();

  const addViolation = (token, reason) => {
    const { line, column } = sourceLocation(sourceText, token.start);
    violations.add(
      `${toPortableRelative(projectRoot, filePath)}:${line}:${column} ${reason}`,
    );
  };

  const inspectModuleSpecifier = (token, specifier) => {
    if (isRemoteModuleSpecifier(specifier)) {
      addViolation(token, `remote module specifier ${JSON.stringify(specifier)}`);
    }
    if (NETWORK_PACKAGES.has(packageRoot(specifier))) {
      addViolation(token, `network client package ${JSON.stringify(packageRoot(specifier))}`);
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const calledPath = dottedPathEndingAt(tokens, index);
    const calledName = calledPath.split('.').at(-1) ?? '';
    const isCall = next?.kind === SyntaxKind.OpenParenToken;

    if (isCall) {
      if (
        calledPath === 'fetch'
        || calledPath === 'window.fetch'
        || calledPath === 'globalThis.fetch'
        || calledPath === 'self.fetch'
        || calledPath === 'importScripts'
        || calledPath === 'self.importScripts'
      ) {
        addViolation(token, `network API call ${calledPath}()`);
      }

      if (calledName === 'sendBeacon' || calledPath.endsWith('.serviceWorker.register')) {
        addViolation(token, `network API call ${calledPath}()`);
      }

      if (NETWORK_CONSTRUCTORS.has(calledName)) {
        addViolation(token, `network-capable API call ${calledPath}()`);
      }

      if (calledName === 'require' && isStringToken(tokens[index + 2])) {
        inspectModuleSpecifier(tokens[index + 2], tokens[index + 2].value);
      }

      if (calledName === 'createElement' && isStringToken(tokens[index + 2])) {
        const tagName = tokens[index + 2].value.toLowerCase();
        if (RESOURCE_CREATING_TAGS.has(tagName)) {
          addViolation(token, `runtime resource element creation createElement(${JSON.stringify(tagName)})`);
        }
      }
    }

    if (
      calledName === 'Image'
      && isCall
      && tokens[index - 1]?.kind === SyntaxKind.NewKeyword
    ) {
      addViolation(token, `network-capable constructor new ${calledPath}()`);
    }

    if (token.kind === SyntaxKind.ImportKeyword) {
      if (next?.kind === SyntaxKind.OpenParenToken && isStringToken(tokens[index + 2])) {
        inspectModuleSpecifier(tokens[index + 2], tokens[index + 2].value);
      } else {
        for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
          const candidate = tokens[cursor];
          if (candidate.kind === SyntaxKind.SemicolonToken) break;
          if (isStringToken(candidate)) {
            inspectModuleSpecifier(candidate, candidate.value);
            break;
          }
        }
      }
    }

    if (token.kind === SyntaxKind.ExportKeyword) {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = tokens[cursor];
        if (candidate.kind === SyntaxKind.SemicolonToken) break;
        if (isStringToken(candidate)) {
          inspectModuleSpecifier(candidate, candidate.value);
          break;
        }
      }
    }
  }

  return [...violations];
}

function inspectFirstPartySource(projectRoot) {
  const sourceDirectory = path.join(projectRoot, 'src');
  const sourceFiles = walkFiles(sourceDirectory);
  const codeFiles = sourceFiles.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const styleFiles = sourceFiles.filter((file) => STYLE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const violations = [];

  for (const file of codeFiles) {
    violations.push(...inspectSourceFile(file, projectRoot));
  }

  for (const file of styleFiles) {
    const cssText = readFileSync(file, 'utf8');
    for (const reference of collectCssReferences(cssText)) {
      if (/^(?:https?:|wss?:|\/\/|file:|ftp:)/i.test(reference.value.trim())) {
        violations.push(
          `${toPortableRelative(projectRoot, file)} remote CSS ${reference.kind}=${JSON.stringify(reference.value)}`,
        );
      }
    }
  }

  const sourceHtmlPath = path.join(projectRoot, 'index.html');
  if (existsSync(sourceHtmlPath)) {
    const sourceHtml = readFileSync(sourceHtmlPath, 'utf8');
    const sourceDom = new JSDOM(sourceHtml);
    for (const [selector, attribute] of HTML_RESOURCE_ATTRIBUTES) {
      for (const element of sourceDom.window.document.querySelectorAll(selector)) {
        const value = element.getAttribute(attribute) ?? '';
        if (/^(?:https?:|wss?:|\/\/|file:|ftp:)/i.test(value.trim())) {
          violations.push(`index.html remote ${element.tagName.toLowerCase()}[${attribute}]=${JSON.stringify(value)}`);
        }
      }
    }
  }

  return {
    sourceFileCount: codeFiles.length + styleFiles.length,
    violations: [...new Set(violations)].sort(),
  };
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function makeCheck(id, passed, evidence) {
  return { id, passed, evidence };
}

function verify(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const distDirectory = path.resolve(projectRoot, options.distDirectory);
  const htmlPath = path.join(distDirectory, 'index.html');
  const checks = [];

  const distFiles = walkFiles(distDirectory);
  const relativeDistFiles = distFiles.map((file) => toPortableRelative(distDirectory, file));
  const hasOnlyIndexHtml = relativeDistFiles.length === 1 && relativeDistFiles[0] === 'index.html';
  checks.push(makeCheck(
    'DIST_EXACTLY_ONE_HTML_FILE',
    hasOnlyIndexHtml,
    hasOnlyIndexHtml
      ? 'dist contains only index.html'
      : `dist files: ${relativeDistFiles.length ? relativeDistFiles.join(', ') : '(none)'}`,
  ));

  let html = '';
  if (!existsSync(htmlPath) || !lstatSync(htmlPath).isFile()) {
    checks.push(makeCheck('BUILT_HTML_SELF_CONTAINED', false, 'dist/index.html is missing'));
  } else {
    html = readFileSync(htmlPath, 'utf8');
    const htmlInspection = inspectBuiltHtml(html);
    checks.push(makeCheck(
      'BUILT_HTML_SELF_CONTAINED',
      htmlInspection.violations.length === 0,
      htmlInspection.violations.length === 0
        ? `${htmlInspection.inlineScriptCount} inline script(s), ${htmlInspection.inlineStyleCount} inline style block(s), no external resource reference`
        : htmlInspection.violations.join('; '),
    ));
  }

  const sourceInspection = inspectFirstPartySource(projectRoot);
  checks.push(makeCheck(
    'FIRST_PARTY_SOURCE_NO_NETWORK_APIS',
    sourceInspection.sourceFileCount > 0 && sourceInspection.violations.length === 0,
    sourceInspection.sourceFileCount === 0
      ? 'no first-party source files found under src/'
      : sourceInspection.violations.length === 0
        ? `${sourceInspection.sourceFileCount} first-party code/style file(s) inspected`
        : sourceInspection.violations.join('; '),
  ));

  const passed = checks.every((check) => check.passed);
  return {
    schemaVersion: 1,
    claim: 'static-offline-bundle',
    passed,
    artifact: existsSync(htmlPath)
      ? {
          path: toPortableRelative(projectRoot, htmlPath),
          bytes: Buffer.byteLength(html),
          sha256: sha256(html),
        }
      : null,
    checks,
    scope: {
      proves: [
        'the build output is one HTML file',
        'the HTML has no external resource reference or non-embedded module import',
        'recognized network APIs and network-client imports are absent from first-party src/',
      ],
      doesNotProve: [
        'that dormant third-party dependency code cannot initiate a request',
        'that every browser code path makes zero requests at runtime',
        'that the artifact works on operating systems or browsers not actually exercised',
      ],
    },
  };
}

function printTextReport(report) {
  for (const check of report.checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.id}: ${check.evidence}`);
  }
  if (report.artifact) {
    console.log(`ARTIFACT ${report.artifact.path} ${report.artifact.bytes} bytes sha256=${report.artifact.sha256}`);
  }
  console.log(`${report.passed ? 'PASS' : 'FAIL'} STATIC_OFFLINE_BUNDLE`);
  console.log('LIMITATION Static inspection is not a runtime zero-request observation and is not an OS/browser compatibility test.');
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printHelp();
  process.exit(2);
}

const report = verify(options);
if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report);
}
process.exit(report.passed ? 0 : 1);
