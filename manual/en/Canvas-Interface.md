# Canvas Interface

The canvas interface is the main workspace where you design your entity relationship diagrams. This section provides a detailed overview of each menu and control available in the interface.

![Canvas Interface Overview](../screenshots/main-canvas-interface.png)

## 2.3.1. About Each Menu

### Title Panel

The title panel appears at the top of the interface and contains:

- **ERD Designer Logo**: Visual identifier for the application
- **Diagram Name Field**: Displays and allows editing of the current diagram name
- **Preferences Button** (⚙️): Access to application settings and preferences

### Edit Mode Panel

The edit mode panel is located on the left side and contains five primary tools:

#### SELECT Mode
![Select Icon](../screenshots/select-icon.png)
- **Purpose**: Default mode for selecting and manipulating existing elements
- **Usage**: Click to select tables, relations, or memos on the canvas
- **Features**: 
  - Single-click to select individual elements
  - Drag to move selected elements
  - Double-click to edit element properties

#### GRAB Mode
![Grab Icon](../screenshots/grab-icon.png)
- **Purpose**: Pan and navigate around the canvas
- **Usage**: Drag to move the entire canvas view
- **When to Use**: Useful when working with large diagrams that extend beyond the visible area

#### TABLE Mode
![Table Icon](../screenshots/table-icon.png)
- **Purpose**: Create new database tables
- **Usage**: Click on the canvas to place a new table
- **Process**: Opens the table creation dialog for defining table properties

#### RELATION Mode
![Relation Icon](../screenshots/relation-icon.png)
- **Purpose**: Create relationships between tables
- **Usage**: Click on one table, then click on another to create a relationship
- **Features**: Supports various relationship types (one-to-one, one-to-many, many-to-many)

#### MEMO Mode
![Memo Icon](../screenshots/memo-icon.png)
- **Purpose**: Add text notes and documentation to your diagram
- **Usage**: Click on the canvas to place a new memo
- **Features**: Customizable text, fonts, colors, and sizes

### Action Panel

Located below the edit mode panel, the action panel provides additional functionality:

#### Display Style
- **Options**: 
  - **Physical**: Show only physical names
  - **Logical**: Show only logical names  
  - **Both**: Show both physical and logical names (default)
- **Purpose**: Control how table and column names are displayed

#### Undo/Redo Controls
- **Undo**: Reverse the last action (Ctrl+Z)
- **Redo**: Reapply a previously undone action (Ctrl+Y)
- **Visual Indicator**: Buttons are disabled when no actions are available

#### Export Menu
The export button provides access to multiple export options:

![Export Menu](../screenshots/export-menu.png)

- **Export DDL**: Generate SQL Data Definition Language scripts
- **Save as Image**: Export the diagram as a PNG image
- **Export Specification**: Generate a table definition document
- **Save to ERD File**: Save the diagram in ERD Designer's native format

### Zoom Controls

Located in the bottom-right corner:

- **Zoom Out Button** (-): Decrease the canvas zoom level
- **Zoom Percentage**: Display and manually set zoom level (25% to 400%)
- **Zoom In Button** (+): Increase the canvas zoom level

### Canvas Area

The central workspace where you build your ERD:

- **Grid Background**: Helps with alignment and positioning
- **Unlimited Space**: Canvas can be expanded in all directions
- **Visual Elements**: Tables, relationships, and memos are displayed here
- **Interactive**: All elements can be selected, moved, and edited

### Keyboard Shortcuts

The canvas interface supports several keyboard shortcuts for efficient workflow:

- **Ctrl+Z**: Undo last action
- **Ctrl+Y**: Redo last action
- **Delete**: Remove selected elements
- **Ctrl+A**: Select all elements
- **Arrow Keys**: Fine-tune position of selected elements

### Context Menus

Right-clicking on different elements provides context-specific options:

- **Tables**: Edit, duplicate, delete, change color
- **Relations**: Edit properties, delete
- **Memos**: Edit text, change formatting, delete
- **Canvas**: Access general canvas options

### Status Indicators

The interface provides visual feedback for various states:

- **Selected Elements**: Highlighted with selection handles
- **Hover Effects**: Elements highlight when mouse hovers over them
- **Validation Indicators**: Visual cues for errors or warnings
- **Auto-save Status**: Indication when changes are automatically saved

The canvas interface is designed to be intuitive while providing professional-grade functionality for database design. Each tool and menu serves a specific purpose in the ERD creation workflow.

---

Next: [Features Guide](Features-Guide.md) | Previous: [Getting Started](Getting-Started.md)