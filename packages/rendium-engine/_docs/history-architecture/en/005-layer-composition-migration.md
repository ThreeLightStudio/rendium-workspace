# Architecture History: Layer Composition Migration (2026-04-07)

[한국어](../ko/005-layer-composition-migration.md)

## 1. Overview
The core layer system of `rendium-engine` has transitioned from a **single inheritance** model to a flexible **composition-based** architecture.

## 2. Background
The legacy `BaseLayer` forced properties only required for rendering (such as WebGPU device references, transform matrices, and opacity) onto all sub-layers (Audio, ScopeEnd, etc.). This caused the following issues:
- **Fat Base Class:** Unnecessary memory consumption by non-visual/inactive layers.
- **Serialization Overhead:** Inclusion of redundant `position`, `scale`, and `visible` data in the JSON output during project saving.
- **Interface Segregation Principle (ISP) Violation:** Forcing `draw()` and `visible` properties onto layers without any visual representation.

## 3. Key Changes

### 3.1 Component Segregation
Spatial and optical properties have been defined into separate interfaces:
- `ITransform`: Manages `position`, `scale`, `rotation`, and `_localMatrix`.
- `IAppearance`: Manages `visible` and `opacity`.

### 3.2 Hierarchy Refactoring
- `ILayer` (Interface): Defines only pure temporal properties like `id`, `startTime`, and `duration`, along with the `update()` method.
- `BaseLayer` (Abstract): Implements `ILayer` and consolidates the timeline management logic.
- `RenderableLayer` (Abstract): Inherits from `BaseLayer` and must compose `ITransform` and `IAppearance`. Manages WebGPU resources and the `draw()` method.
- `AudioLayer` & `ScopeEndLayer`: Inherit directly from `BaseLayer` to remove GPU dependencies.
- `ScopeStartLayer`: Inherits from `BaseLayer` and has been changed to optionally compose `ITransform` and `IAppearance` (making them optional).

### 3.3 Logic Optimization
- `Scene.update()`: Updates all layers based on the timeline. Removed the `visible` check from the update stage.
- `Scene.draw()`: Filters only visual layers using the `isRenderable` type guard, and performs rendering only if `appearance.visible` is true.

## 4. Consequences and Benefits
- **Memory Optimization:** Reduces memory consumption in large projects by minimizing data held by non-visual layers.
- **Stability:** Clearly separates the rendering pipeline from logical updates.
- **Extensibility:** Eases the addition of new components, such as 3D transforms or physics engines, in the future.
