# v0.3.2 Observed Usability Moderator Script

Use standard technical English. Read quoted prompts verbatim. Neutral prompts
are limited to “What do you see?” and “What do you plan to do next?” Any
instruction that identifies a correct control, interpretation, or remedy is a
rescue and must be recorded.

## Opening

> We are testing the interface, not you. You may stop at any time. Please think
> aloud. Use only the supplied synthetic files. Do not open a formula reference,
> calculator, personal file, or network resource.

Confirm recording consent, start separate screen and audio recordings, state
the pseudonymous participant ID, and record the session start time.

## UX01

> Create an activation-energy analysis from this synthetic four-condition TGA
> file. Temperature is in °C, mass is in percent, and heating rate is in K/min.
> The sample is `synthetic-kas`, the atmosphere is N2, and the mass-loss stage
> to analyze is 300–380 °C. Set the project name to `UX01 Four Run` and the
> process to `synthetic mass loss`. Run the eligible methods and export the PDF
> report. Do not use a formula or external calculator.

Record macro decisions, semantic activations, pointer clicks, OS-picker clicks,
rescues, formula use, completion, export hash, and whether the PDF opens.

## R1–R5

Use the participant's cyclic order from `PROTOCOL.md`. When the refusal appears,
ask:

1. “What is the problem?”
2. “Why is this scientifically risky?”
3. “What would you correct in the data or analysis context before continuing?”

Do not identify the diagnostic code. Retain the complete verbatim answer and
the screen/audio timecode for each scenario.

## C1

Load the unchanged W2 curve together with C1 peaks. With both result types
visible, ask once:

> Are the `Ea(α)` curve and the single-peak Kissinger Ea value on the screen two
> presentations of the same result? Which conversion or physical event does
> each represent, and can they be reported interchangeably?

Do not hint or allow a scored second attempt. Retain the first verbatim answer
and timecode.

## Close

Stop both recordings, record their declared durations and SHA-256 values, note
all deviations and rescues, and confirm that no personal or institutional data
entered the package. Do not tell the participant whether they passed.
