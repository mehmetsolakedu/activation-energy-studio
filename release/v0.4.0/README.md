# Activation Energy Studio v0.4.0 candidate metadata

This directory currently contains release metadata only. It is not a complete
release package and must not be published as one.

The self-contained application HTML, final manifest, and release checksums are
intentionally absent until the end-to-end audit passes and Mehmet Solak gives
explicit release approval. The candidate has not been deployed, uploaded to
Zenodo, or substituted for the historical v0.3.2 artifact.

Metadata included at this stage:

- `CITATION.cff`: sole-author citation metadata;
- `LICENSE`: license for the project-authored software and documentation;
- `THIRD_PARTY_NOTICES.md`: dataset attribution and complete production
  dependency license inventory;
- `SBOM.production.cdx.json`: lockfile-derived CycloneDX production SBOM;
- `licenses/`: the license text shipped by each locked production dependency;
- `RELEASE_NOTES_v0.4.0.md`: draft change classification and release gate.

Before publication, regenerate and verify the metadata against the final
`package-lock.json`, add the built HTML, create the final manifest and checksum
file, and run the full scientific, security, offline, browser, and release
gates.
