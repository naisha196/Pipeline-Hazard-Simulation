# Pipeline Hazard Simulation System

## Overview
The **Pipeline Hazard Simulation System** is a web-based tool designed to visualize and simulate instruction execution in pipelined processor architectures.

This interactive tool allows users to input sequences of MIPS-like instructions, configure pipeline parameters, and visualize how data hazards occur and how they are resolved using stalling or data forwarding.

## Features
- **Customizable Instruction Sequence**: Input your own sequence of instructions using standard MIPS syntax (`ADD`, `SUB`, `LW`, `SW`).
- **Pipeline Architecture Configuration**: Choose between:
  - **5-Stage Pipeline**: IF, ID, EX, MEM, WB
  - **4-Stage Pipeline**: IF, ID, EX, MEM/WB
- **Hazard Resolution Strategy**: Toggle between different data hazard handling techniques:
  - **Stall Only**: Inserts pipeline bubbles to resolve dependencies.
  - **Forwarding**: Implements data forwarding (bypass) to minimize stalls.
- **Interactive Visualization**: Step-by-step or continuous execution to observe the flow of instructions through the pipeline stages.
- **Hazard Reporting**: Detailed breakdown of detected data hazards, showing exactly which instructions conflict.
- **Dynamic UI**: A modern, responsive, and visually appealing interface ("Orbital Deck" theme).

## Project Structure
- `index.html`: The main user interface and application entry point.
- `style.css`: Stylesheet containing the visual design, layout, and animations.
- `app.js`: Application logic handling user interactions and UI updates.
- `parser.js`: Parses the inputted instruction strings into structured data objects.
- `hazard.js`: Contains the logic for detecting data hazards based on dependencies.
- `scheduler.js`: Determines the pipeline schedule and cycle-by-cycle execution flow depending on the selected configuration and hazard resolution strategy.
- `renderer.js`: Responsible for generating the visual pipeline table and updating the simulation view.

## Usage
1. **Instruction Setup**: Use the `+` and `-` buttons to choose the number of instructions. Enter your instructions in the input fields using the accepted syntax:
   - `ADD Rd, Rs1, Rs2`
   - `SUB Rd, Rs1, Rs2`
   - `LW Rd, offset(Rs)`
   - `SW Rs, offset(Rb)`
2. **Pipeline Configuration**: Select whether you want to simulate a 5-stage or 4-stage pipeline, and whether to resolve hazards via stalling or data forwarding.
3. **Simulation Controls**:
   - Click **RUN** to execute the entire sequence instantly.
   - Click **STEP** to step through the simulation cycle by cycle.
   - Click **RESET** to clear the current simulation state.
4. **Analysis**: View the detected hazards in the "Detected Hazards" panel and study the pipeline execution table in the "Pipeline Visualization" panel.

