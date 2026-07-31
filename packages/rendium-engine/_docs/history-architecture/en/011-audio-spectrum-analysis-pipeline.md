# 011. Audio Spectrum Analysis Pipeline

[한국어](../ko/011-audio-spectrum-analysis-pipeline.md)

Status: Accepted for core implementation

## Context

The current spectrum visualizer mixes audio analysis assumptions into
`SpectrumDrawableProvider`. The provider smooths FFT data locally, samples one
FFT bin position per visual band, and uploads the full FFT buffer to WebGPU.

That shape creates four problems:

- Single-bin sampling misses the energy distributed across each visual band's
  frequency range, especially in wide high-frequency bands.
- Symmetric smoothing uses the same response for rising and falling energy, so
  attacks become dull while releases do not read as musical decay.
- Live preview and offline export can drift because FFT size, bin count, sample
  rate, and decibel normalization are not represented by one shared contract.
- Multiple spectrum layers linked to the same audio source repeat CPU-side
  smoothing and data preparation instead of sharing a processed frame.

## Decision

Introduce a renderer-independent audio spectrum processing contract and
processor.

`AudioSpectrumContract` is the single source of truth for FFT size, sample rate,
band count, frequency range, decibel range, and band scale. The first supported
scale is `mel`, matching the existing spectrum look while allowing future
`octave` and `log` strategies to use the same pipeline.

`ISpectrumProcessor` accepts raw linear-magnitude FFT bins and produces a
`BandFrame` DTO. The processor owns:

- band boundary calculation from the contract,
- RMS aggregation across the FFT bin range covered by each band,
- dB normalization into `0..1`,
- asymmetric attack/release EMA smoothing,
- reusable typed-array storage for low-GC frame production.

The visual renderer consumes `BandFrame` data. It does not decide FFT contracts,
perform band aggregation, or apply temporal dynamics.

## Data Flow

As-is:

```text
AudioLayer / AudioManager
  -> raw or normalized FFT data
  -> SpectrumDrawableProvider
  -> provider-local smoothing and single-bin shader sampling
  -> GPU buffer upload
```

To-be:

```text
AudioSource
  -> raw linear-magnitude FFT data matching AudioSpectrumContract
  -> SpectrumProcessor
  -> cached BandFrame
  -> VisualRenderer / SpectrumDrawableProvider
  -> GPU buffer upload and instanced draw
```

## Consequences

- Preview and export can be validated against the same FFT contract instead of
  relying on parallel constants.
- Band energy is physically closer to the source signal because each visual band
  represents an RMS range rather than one sampled bin.
- Attack and release behavior can be tuned independently for sharper transients
  and calmer falloff.
- Multiple visual spectrum layers can later share one processed `BandFrame` per
  linked audio source and timestamp.
- Future scales such as fractional octave or logarithmic bands can be added by
  replacing boundary calculation without changing renderer code.
