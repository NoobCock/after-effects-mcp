<p align="center">
  <img src="https://img.shields.io/badge/After%20Effects-2024+-9999FF?style=for-the-badge&logo=adobe-after-effects&logoColor=white" alt="After Effects 2024+"/>
  <img src="https://img.shields.io/badge/MCP-Protocol-00D4AA?style=for-the-badge" alt="MCP Protocol"/>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 18+"/>
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License"/>
</p>

<h1 align="center">AE-MCP</h1>
<p align="center"><strong>After Effects Model Context Protocol Server</strong></p>
<p align="center">Automate Adobe After Effects with AI through 102 MCP tools, resources, and prompts</p>

---

## Overview

AE-MCP is a Model Context Protocol (MCP) server that connects AI assistants (Antigravity, Claude Desktop, Claude Code, etc.) directly to **Adobe After Effects 2024+**. It exposes **102 tools**, **2 MCP resources**, and **2 prompts** spanning project management, layer/path/mask authoring, 3D rendering, keyframe & expression scripting, frame inspection, and render queue / Adobe Media Encoder delivery.

> Forked from [`ishu86/after-effects-mcp`](https://github.com/ishu86/after-effects-mcp) with a hardened zero-idle-IPC CEP bridge (preventing Win32 UI thread stalls and mouse/keyboard input lockups on Windows), serialized atomic command queuing, off-screen panel geometry self-healing, and an unopinionated technical [`SKILL/SKILL.md`](SKILL/SKILL.md).

### Key Features

| Feature | Description |
|---------|-------------|
| **102 MCP Tools** | Full control of projects, comps, layers, bezier paths, masks, 3D, keyframes, expressions, effects, and rendering |
| **Visual & State Inspection** | `render_frame` (PNG preview) and `get_comp_report` (geometry, text, expressions, keyframe & value samples) |
| **Physics & Expression Templates** | 23 pre-built templates (`overshoot`, `bounce`, `inertia`, `springy`, `speedControl`, `loopingWiggle`, etc.) |
| **3D, Paths & Masks** | Comp renderer switching (`classic` / `advanced` / `cinema4d`), extrusion/bevels, bezier shape paths & operators, and animated masks |
| **Zero-Idle-IPC CEP Bridge** | Node `fs` watching inside `CEPHtmlEngine` avoids polling AE's main UI thread when idle and prevents Win32 input freezes |
| **Render Queue & AME** | Native render queue control plus non-blocking Adobe Media Encoder (`queue_in_ame`) handoff |

---

## Requirements

- **Adobe After Effects 2024** (`24.0`) or later (tested through After Effects 2026)
- **Node.js 18+**
- **macOS** or **Windows**

---

## Installation

### Step 1: Clone and Build the MCP Server

```bash
git clone https://github.com/NoobCock/after-effects-mcp.git
cd after-effects-mcp
npm install
npm run build
```

*(Optionally run `npm test` to verify all 119 unit and regression tests pass.)*

### Step 2: Install the CEP Extension (`com.aemcp.panel`)

**macOS:**
```bash
./scripts/install-cep.sh
```

**Windows (Command Prompt / PowerShell):**
```batch
scripts\install-cep.bat
```
> On Windows, `install-cep.bat` enables `PlayerDebugMode` in `HKCU\SOFTWARE\Adobe\CSXS.10`–`12`, installs `cep-extension/` to `%APPDATA%\Adobe\CEP\extensions\com.aemcp.panel` (symlink with copy fallback), and ends with `pause`. For non-interactive automation on Windows, enable `PlayerDebugMode = 1` (`REG_SZ`) and copy `cep-extension\*` directly into `%APPDATA%\Adobe\CEP\extensions\com.aemcp.panel`.

### Step 3: Configure Your AI Assistant

<details>
<summary><strong>Antigravity</strong></summary>

Add `ae-mcp` to `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "ae-mcp": {
      "command": "node",
      "args": ["/path/to/after-effects-mcp/dist/index.js"]
    }
  }
}
```

*(On Windows, use an absolute path such as `"D:\\AAProjectz\\after-effects-mcp\\dist\\index.js"`.)*

To install the companion skill globally, copy [`SKILL/SKILL.md`](SKILL/SKILL.md) to `~/.gemini/config/skills/ae-mcp/SKILL.md`.

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to your config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ae-mcp": {
      "command": "node",
      "args": ["/path/to/after-effects-mcp/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><strong>Claude Code (CLI)</strong></summary>

Add to your MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "ae-mcp": {
      "command": "node",
      "args": ["/path/to/after-effects-mcp/dist/index.js"]
    }
  }
}
```

To install the companion skill for Claude Code, copy [`SKILL/SKILL.md`](SKILL/SKILL.md) into your skills directory (e.g. `~/.claude/skills/ae-mcp/SKILL.md`):

```bash
mkdir -p ~/.claude/skills/ae-mcp
cp SKILL/SKILL.md ~/.claude/skills/ae-mcp/SKILL.md
```
</details>

[`SKILL/SKILL.md`](SKILL/SKILL.md) acts purely as a technical API reference and ExtendScript gotcha guide (property paths, value formats, 3D renderer matrices, particle bounds, and rendering caveats) without prescribing visual styles or timing constraints.

### Step 4: Launch After Effects

1. Start (or restart) **After Effects 2024+**
2. Open **Window > Extensions > AE-MCP**
3. Keep the panel open (docking it into a side panel is recommended). It watches `~/Documents/ae-mcp-commands/` with zero idle `evalScript` overhead.

---

## Capabilities (102 Tools · 2 Resources · 2 Prompts)

### Project & Assets (15)
`create_project` · `open_project` · `save_project` · `close_project` · `get_project_info` · `list_project_items` · `import_footage` · `import_folder` · `replace_footage` · `organize_project_items` · `find_missing_footage` · `collect_files` · `reduce_project` · `set_proxy` · `remove_proxy`

### Compositions & Inspection (9)
`create_composition` · `modify_composition` · `duplicate_composition` · `delete_composition` · `list_compositions` · `get_composition_info` · `set_active_composition` · `render_frame` · `get_comp_report`

### Layers (14)
`add_solid_layer` · `add_text_layer` · `add_text_layer_advanced` · `add_shape_layer` · `add_null_layer` · `add_adjustment_layer` · `add_camera_layer` · `add_light_layer` · `add_av_layer` · `precompose_layers` · `modify_layer` · `delete_layer` · `list_layers` · `get_layer_info`

### Shape Paths & Operators (4)
`create_path` · `get_path` · `set_path_keyframes` · `add_shape_operator`

### Masks (7)
`add_mask` · `list_masks` · `get_mask_path` · `set_mask_path` · `set_mask_keyframes` · `set_mask_properties` · `delete_mask`

### 3D, Cameras & Lights (7)
`set_comp_renderer` · `get_3d_info` · `set_3d_layer` · `set_material_options` · `set_geometry_options` · `set_camera_options` · `set_light_options`

### Keyframes & Timing (9)
`set_keyframe` · `set_keyframe_advanced` · `apply_easy_ease` · `set_temporal_ease` · `offset_keyframes` · `scale_keyframe_timing` · `reverse_keyframes` · `copy_keyframes` · `get_keyframes`

### Expressions (8)
`set_expression` · `get_expression` · `remove_expression` · `enable_expression` · `add_expression_control` · `apply_expression_template` · `link_properties` · `batch_set_expressions`

### Effects (7)
`apply_effect` · `apply_effect_template` · `modify_effect_properties` · `remove_effect` · `reorder_effects` · `copy_effects` · `list_effects`

### Motion Graphics Templates (5)
| Tool | Supported Styles / Types |
|------|--------------------------|
| `create_lower_third` | `modern`, `corporate`, `news`, `minimal`, `social` |
| `create_title_card` | `cinematic`, `documentary`, `social`, `minimal` |
| `create_transition` | `wipe_left`, `wipe_right`, `wipe_up`, `wipe_down`, `dissolve`, `push`, `slide`, `zoom` |
| `create_logo_reveal` | `fade`, `scale`, `slide`, `spin`, `glitch`, `particle` |
| `create_text_animator` | `typewriter`, `fadeInChars`, `scaleInChars`, `slideInChars`, `randomize`, `wave` |

### Markers & Time Navigation (10)
`add_composition_marker` · `add_layer_marker` · `get_markers` · `delete_marker` · `set_work_area` · `get_current_time` · `set_current_time` · `snap_to_marker` · `get_nearest_marker` · `navigate_markers`

### Render Queue & AME (7)
`add_to_render_queue` · `list_render_queue` · `list_render_templates` · `set_render_queue_item` · `remove_from_render_queue` · `control_render` · `queue_in_ame`

### MCP Resources & Prompts
- **Resources:** `ae://project/current` · `ae://compositions`
- **Prompts:** `create-animation` · `setup-project`

---

## Expression & Effect Templates

### Expression Templates (`apply_expression_template`)
| Category | Templates |
|----------|-----------|
| **Wiggle** | `wiggle` · `wiggleSmooth` · `wiggleFadeIn` · `wiggleFadeOut` · `loopingWiggle` · `wiggleOneAxis` |
| **Loop** | `loopCycle` · `loopPingpong` · `loopOffset` · `loopContinue` |
| **Physics & Speed** | `overshoot` · `bounce` · `inertia` · `springy` · `speedControl` |
| **Linking** | `matchPosition` · `offsetPosition` · `inverseRotation` · `followPath` |
| **Time** | `time` · `clock` · `countdown` · `frameNumber` |

### Effect Templates (`apply_effect_template`)
| Category | Templates |
|----------|-----------|
| **Blur** | `gaussianBlur` · `directionalBlur` · `glassBlur` |
| **Color** | `curves` · `colorBalance` · `brightnessContrast` · `vibrance` |
| **Stylistic** | `glow` · `dropShadow` · `vignette` |
| **Creative** | `cinematicLook` · `vhsRetro` · `neonGlow` · `filmGrain` · `chromaticAberration` · `duotone` |

---

## Architecture

```
after-effects-mcp/
├── src/
│   ├── index.ts                          # CLI / stdio entry point
│   ├── stdio-server.ts                   # MCP server (102 tools, 2 resources, 2 prompts)
│   ├── stdio-server.test.ts              # Tool registration & schema dispatch tests
│   ├── ae-integration/
│   │   ├── file-communicator.ts          # Serialized queue + atomic file IPC
│   │   ├── scriptGenerator.ts            # Central generator exports
│   │   ├── errorHandler.ts               # Friendly error mapping
│   │   ├── host.test.ts                  # CEP host ExtendScript cleanup & guard tests
│   │   └── generators/                   # ES3 ExtendScript generators + regressions
│   ├── presets/                          # Effect, expression, motion-graphics & animation presets
│   └── types/                            # AE property aliases, MCP types & JSON schemas
├── cep-extension/                        # After Effects CEP panel (com.aemcp.panel)
│   ├── index.html                        # Panel UI
│   ├── CSXS/manifest.xml                 # CEP 12 manifest (--enable-nodejs, --mixed-context)
│   ├── js/main.js                        # Node fs folder watcher + evalInFlight lock
│   ├── jsx/host.jsx                      # ES3 ExtendScript host & undo/dialog cleanup
│   ├── css/style.css                     # Panel styles
│   └── lib/CSInterface.js                # CEP bridge helper
├── SKILL/
│   └── SKILL.md                          # Technical skill guide for AI assistants
└── scripts/
    ├── install-cep.bat                   # Windows CEP installer
    ├── install-cep.sh                    # macOS CEP installer
    └── test.mjs                          # Portable test runner
```

### Communication Flow

```
AI Assistant (Antigravity / Claude)
        ↓ MCP (Stdio)
   MCP Server (Node.js)
        ↓ Serialized queue (60ms spacing) + atomic .tmp -> .json write
   ~/Documents/ae-mcp-commands/
        ↓ Watched every 150ms via Node fs inside CEPHtmlEngine (0 idle IPC to AE)
   CEP Extension (main.js)
        ↓ Single in-flight evalScript + 80ms Win32 UI cooldown
   ExtendScript Host (host.jsx)
        ↓ Single undo group + dialog suppression (no $.sleep blocking)
   After Effects DOM
        ↓ Atomic .response.tmp -> .response + immediate command cleanup
   MCP Server → AI Assistant
```

---

## Development & Testing

```bash
npm run build   # Compile TypeScript (src/ -> dist/)
npm test        # Run all test suites via scripts/test.mjs
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, and `npm test` on Node 18 and 22 across Ubuntu and Windows.

---

## Troubleshooting

<details>
<summary><strong>Extension not appearing in After Effects</strong></summary>

1. Verify `PlayerDebugMode` is set to `1` (`CSXS.10`–`CSXS.12`, and `CSXS.13` if applicable).
2. Restart After Effects completely.
3. Check the installed extension folder:
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/com.aemcp.panel`
   - **Windows:** `%APPDATA%\Adobe\CEP\extensions\com.aemcp.panel`
</details>

<details>
<summary><strong>AE-MCP panel opens off-screen</strong></summary>

If a floating `AE-MCP` window was dragged outside monitor bounds, `host.jsx` (`initMCP()`) automatically resets off-screen `PlugPlugWindowGeometry` coordinates back into view on initialization. You can also choose **Window > Workspace > Reset "Default" to Saved Layout** in After Effects, reopen **Window > Extensions > AE-MCP**, and dock it into a side panel.
</details>

<details>
<summary><strong>Commands timing out</strong></summary>

1. Ensure the **AE-MCP** panel is open (**Window > Extensions > AE-MCP**) and shows `Status: Running`.
2. Verify no modal dialog (alert, save prompt, or file picker) is blocking After Effects.
3. Check `~/Documents/ae-mcp-commands/` for stuck `.json` files and inspect the panel log.
4. For long renders, prefer `queue_in_ame` over `control_render(action="start")`, which synchronously blocks the CEP bridge until rendering finishes.
</details>

<details>
<summary><strong>Script errors</strong></summary>

1. Verify composition and layer names/IDs with `list_compositions` and `list_layers`.
2. Use `/` for nested property paths (never `.`), and use uppercase AE enum constants (e.g., `SCREEN`, `CENTER`).
3. Ensure any custom ExtendScript remains strictly ES3-compatible (no `let`/`const`, arrow functions, or template literals).
</details>

---

## License

MIT
