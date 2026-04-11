# ERD Designer

ERD Designer is a VSCode extension for visually designing database Entity Relationship Diagrams.
This tool is inspired by [ERMaster](https://ermaster.sourceforge.net/index.html).

## Screenshots

| ![Canvas](images/01_canvas.png) |
|:--:|
| Main canvas view with tables and relationships |

| ![Edit Column](images/02_edit-column.png) | ![Add relation](images/03_add-relation.gif) |
|:--:|:--:|
| Editing table columns using shared models | Creating relationships between tables |

| ![Select color](images/04_color.png) | ![Perspective](images/05_canvas-perspective.gif) |
|:--:|:--:|
| Customizing table and memo colors | Organizing tables by perspectives |

## Features

- **Visual ERD Design**: Design database tables and relationships through an intuitive graphical interface
- **Export Capabilities**: Export diagrams as PNG images or generate DDL files
- **Reusable Column Models**: Share and reuse column definitions across multiple tables
- **Organized Views**: Use perspectives to group tables and memos by function or purpose
- **Customizable Appearance**: Customize colors for tables and memos to improve diagram readability

## Getting Started

1. Create a new file with the `.erd` extension (e.g., `my-database.erd`)
2. Open the file in VS Code
3. The ERD Designer editor will automatically launch
4. Start designing your database schema!

## How to Use

### Creating Tables
1. Select **Create Table** mode from the toolbar
2. Click on the canvas where you want to place a new table
3. Define columns with types, constraints, and comments
4. Use shared column models for consistency across tables

### Defining Relationships
1. Select **Create Relation** mode from the toolbar
2. Click on a source table, then click on a target table to create a relationship
3. Configure relationship types (1:1, 1:N, N:M)
4. Set foreign key constraints and naming conventions

### Organizing Your Diagram
- Use perspectives to create different views of your schema
- Group related tables by feature or module
- Apply colors to tables and memos for visual organization

### Use MCP Server (Experimental)

ERD Designer includes an experimental MCP (Model Context Protocol) Server that allows AI assistants to interact with your ERD files.

#### Setup

1. **Enable MCP Server in VS Code Settings**
   - Open VS Code Settings (Cmd+, on macOS)
   - Search for "ERD Designer"
   - Check "Enable MCP Server"

2. **Configure MCP Server**
   - Create or edit `.vscode/mcp.json` in your workspace
   - Add the following configuration:
   ```json
   {
     "servers": {
       "erd-designer-mcp": {
         "type": "http",
         "url": "http://localhost:53753/mcp"
       }
     }
   }
   ```

3. **Start Using**
   - Once configured, AI assistants with MCP support can access and modify your ERD files
   - The server runs locally on port 53753 when enabled

#### Important Notes

- This feature is experimental and subject to change
- The MCP Server only runs when VS Code is active
- Only ERD files currently open in VS Code can be accessed and modified
- Ensure the port 53753 is not blocked by firewall settings

## Documentation

For detailed documentation and advanced features, please visit the [Wiki](https://github.com/kajitiluna/erd-designer/wiki).

## Requirements

- Visual Studio Code version 1.105.0 or higher

## Known Issues

Please report issues on [GitHub Issues](https://github.com/kajitiluna/erd-designer/issues).

## Contributing

Contributions are welcome!
Please visit our [GitHub repository](https://github.com/kajitiluna/erd-designer) for more information.

## License

This extension is licensed under the Apache License 2.0.
See the [LICENSE](https://github.com/kajitiluna/erd-designer/blob/main/LICENSE) file for details.
