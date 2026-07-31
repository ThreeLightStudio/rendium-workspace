# ADR 004: POC Refinement and Performance Optimization (Registry and Data Standardization)

[한국어](../ko/004-poc-refinement-and-performance.md)

## Context
As the complexity of the Studio application grew, we needed to optimize layer search performance and standardize data structures to ensure WebGPU rendering stability. Furthermore, we aimed to establish a serialization and recovery mechanism for the Scene to support project persistence.

## Decision

### 1. Search Optimization: "Introduction of O(1) Layer Registry"
* **Decision:** Maintain a `Map`-based layer Registry inside the `Scene` class.
* **Rationale:** The previous linear $O(n)$ search degraded UI responsiveness as the number of layers increased. The Registry guarantees instant ID-based access to optimize state querying outside the rendering loop.
* **Consistency:** Atomically synchronize the Registry when adding or deleting layers via the `SceneMutator`.

### 2. Layout Standardization: "Upgrading to 256-byte Uniform Alignment"
* **Decision:** Fix the uniform buffer size for all WebGPU layers to 256 bytes (64 floats).
* **Rationale:** The initial 112-byte layout was sufficient for basic transform data but lacked the capacity to expand with advanced style properties like shadows, outlines, and filters. A 256-byte layout complies with WebGPU's alignment constraints while providing sufficient padding for future extension.

### 3. Coordinate System Unification: "1920x1080 Logical Pixel System"
* **Decision:** Perform all position and size calculations inside the engine using a fixed 1920x1080 logical pixel resolution.
* **Rationale:** Using Normalized Device Coordinates (NDC) directly makes it difficult to handle changes in aspect ratio. The logical pixel system provides a consistent unit of distance between the UI transform tools and engine rendering, maximizing developer convenience.

### 4. Persistence Layer: "Serialization of Scene Template & Config"
* **Decision:** Formalize serialization and deserialization of the entire scene and layer configurations into JSON using the `ISceneConfig` interface.
* **Features:**
  * `getSceneConfig()`: Extracts the entire current editing state.
  * `loadSceneConfig()`: Restores the entire project, including the resolution.
  * `loadTemplate()`: Injects a specific layer structure into an existing project.

### 5. Visual Style Extension: "Text Outlines & Visualizer Modes"
* **Decision:** Add stroke (outline) features to the text layer to improve rendering quality, and support multiple rendering modes (Waveform, Circle) in the audio visualizer.

## Consequences and Benefits
1. **Performance Increase:** The introduction of the Registry keeps the UI inspector responsive even in complex projects with hundreds of layers.
2. **Stability Secured:** Hardware compatibility issues are resolved through the 256-byte uniform alignment standardization, laying the groundwork for high-end shader extensions.
3. **Data Compatibility:** Project saving/loading and user preset sharing are now possible via the template system.
