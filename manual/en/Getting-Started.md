# Getting Started

This section explains how to start using ERD Designer in both online and Google Drive App modes.

## 2.1. Online Service (Direct GitHub Pages Access)

### Creating a New ER Diagram

1. **Access the Online Tool**
   - Navigate to [kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)
   - You will see the ERD Designer startup page

   ![ERD Designer Startup Page](../screenshots/startup-page.png)

2. **Privacy Notice**
   - ERD Designer uses IndexedDB to store documents locally
   - You may see a notice about allowing IndexedDB usage
   - This ensures your data remains on your local machine

3. **Create New Diagram**
   - Click the **"Create New ER Diagram"** button
   - A dialog will appear asking for diagram settings

   ![Create New Diagram Dialog](../screenshots/create-new-dialog.png)

4. **Configure Diagram Settings**
   - **Diagram name**: Enter a descriptive name for your ERD (e.g., "TODO App ERD")
   - **Database**: Select your target database type (PostgreSQL, MySQL, MS SQL Server)
   - Click **"Start design ER Diagram."** to proceed

5. **Access the Canvas**
   - You will be redirected to the main canvas interface
   - The canvas is where you design your entity relationship diagram

### Opening an Existing ER Diagram

1. **Import from ERD File**
   - Click the **"Import from erd file"** button on the startup page
   - Select an `.erd` file from your local machine
   - The diagram will load in the canvas

2. **Access Recent Documents**
   - The startup page shows recently updated documents
   - Click on any document to open it directly

## 2.2. Google Drive App

### Installing the Google Drive App

1. **Install from Marketplace**
   - Visit the [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491)
   - Click **"Install"** to add ERD Designer to your Google Workspace
   - Follow the authorization prompts to grant necessary permissions

### Creating a New ER Diagram in Google Drive

1. **Access Google Drive**
   - Go to [drive.google.com](https://drive.google.com)
   - Navigate to the folder where you want to create the diagram

2. **Create New ERD File**
   - Click **"New"** in Google Drive
   - Select **"More"** from the dropdown menu
   - Choose **"ERD Designer"** from the available apps
   - Configure the diagram settings as described in the online service section

### Opening an Existing ER Diagram in Google Drive

1. **Double-click ERD Files**
   - Any `.erd` files in your Google Drive can be opened by double-clicking
   - The file will open in ERD Designer within Google Drive

2. **Right-click Context Menu**
   - Right-click on an `.erd` file
   - Select **"Open with"** → **"ERD Designer"**

### Important Considerations for Google Drive App

- **Collaborative Viewing**: Multiple users can view the same ERD file simultaneously
- **Editing Limitations**: Only one user can edit at a time due to optimistic concurrency control
- **File Sharing**: Shared files maintain the same access permissions as set in Google Drive
- **Auto-saving**: Changes are automatically saved to Google Drive

## 2.3. Canvas Interface Overview

Once you have created or opened an ERD, you will be working in the main canvas interface. The canvas provides all the tools necessary for designing your entity relationship diagram.

![Main Canvas Interface](../screenshots/main-canvas-interface.png)

### Key Elements of the Canvas Interface

1. **Title Bar** (Top)
   - Display the current diagram name
   - Access to preferences and settings

2. **Tool Panel** (Left side)
   - **Select Mode**: For selecting and manipulating existing elements
   - **Grab Mode**: For panning around the canvas
   - **Table Mode**: For creating new database tables
   - **Relation Mode**: For creating relationships between tables
   - **Memo Mode**: For adding notes and documentation

3. **Action Panel** (Left side, below tools)
   - **Display Style**: Controls how tables are displayed
   - **Undo/Redo**: Navigate through your edit history
   - **Export**: Access various export options

4. **Zoom Controls** (Bottom right)
   - Zoom in/out buttons
   - Zoom percentage selector

5. **Canvas Area** (Center)
   - Main workspace for designing your ERD
   - Drag and drop elements here
   - Visual representation of your database structure

The canvas interface is intuitive and provides immediate visual feedback as you build your entity relationship diagram.

---

Next: [Canvas Interface](Canvas-Interface.md) | Previous: [Home](Home.md)