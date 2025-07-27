# Features Guide

This comprehensive guide covers all the features available in ERD Designer, with detailed explanations and examples using a TODO application database structure.

## 3.1. Tables

Tables are the core components of any entity relationship diagram. ERD Designer provides comprehensive table management capabilities.

### 3.1.1. Table Creation Overview

Creating tables in ERD Designer is straightforward and follows a guided process.

#### Creating a New Table

1. **Select Table Mode**
   - Click the **TABLE** button in the edit mode panel
   - The button will be highlighted indicating table creation mode is active

2. **Place the Table**
   - Click anywhere on the canvas where you want to place the table
   - The table creation dialog will open automatically

   ![Table Creation Dialog](../screenshots/table-creation-dialog.png)

3. **Configure Table Properties**
   - **Physical Name**: The actual table name in the database (e.g., "users")
   - **Logical Name**: A human-readable description (e.g., "Users")
   - **Description**: Optional documentation for the table

4. **Add Columns**
   - Use the "Add column" button to create new columns
   - Each column has its own configuration dialog

#### Example: Creating a Users Table

Let's create a users table for a TODO application:

```
Physical Name: users
Logical Name: Users
Description: Application users who can create and manage TODO items
```

### 3.1.2. Adding, Editing, and Deleting Columns

Columns define the structure and data types for your tables.

#### Adding a Column

1. **Access Column Creation**
   - In the table edit dialog, click **"Add column"**
   - The column edit dialog will open

   ![Column Edit Dialog](../screenshots/column-edit-dialog.png)

2. **Configure Column Properties**
   - **Physical Name**: Database column name (e.g., "id")
   - **Logical Name**: Descriptive name (e.g., "User ID")
   - **Column Type**: Select from database-specific types
   - **Constraints**: Primary Key, Not Null, Unique, etc.

3. **Primary Key Configuration**
   - Check "Primary Key" to make this the table's primary key
   - Automatically sets "Not Null" constraint
   - Disables "Unique" (automatically unique as primary key)

4. **Data Type Selection**
   - Choose from extensive list of database-specific types
   - For PostgreSQL: serial, integer, varchar, text, timestamp, etc.
   - Precision and scale options for numeric types
   - Array support for PostgreSQL

#### Example: Creating Columns for Users Table

**ID Column (Primary Key):**
```
Physical Name: id
Logical Name: User ID
Type: SERIAL
Constraints: Primary Key, Not Null
```

**Username Column:**
```
Physical Name: username
Logical Name: Username
Type: VARCHAR(50)
Constraints: Not Null, Unique
```

**Email Column:**
```
Physical Name: email
Logical Name: Email Address
Type: VARCHAR(255)
Constraints: Not Null, Unique
```

**Created At Column:**
```
Physical Name: created_at
Logical Name: Created At
Type: TIMESTAMP WITHOUT TIME ZONE
Constraints: Not Null
Default Value: CURRENT_TIMESTAMP
```

#### Editing Existing Columns

1. **Select Column**: Click on a column row in the table editor
2. **Edit Button**: Click the "Edit column" button
3. **Modify Properties**: Update any column properties as needed
4. **Save Changes**: Click "OK" to apply changes

#### Deleting Columns

1. **Select Column**: Click on the column you want to delete
2. **Delete Button**: Click the "Remove column" button
3. **Confirm**: Confirm the deletion in the prompt

### 3.1.3. Adding, Editing, and Deleting Indexes

Indexes improve database query performance and enforce constraints.

#### Creating an Index

1. **Access Index Tab**: In the table editor, click the "Index" tab
2. **Add Index**: Click "Add index" button
3. **Configure Index**:
   - **Index Name**: Descriptive name for the index
   - **Index Type**: BTREE, HASH, GIST, etc. (database-dependent)
   - **Columns**: Select which columns to include
   - **Unique**: Check if this should be a unique index

#### Example: Creating Indexes for Users Table

**Username Index:**
```
Name: idx_users_username
Type: BTREE
Columns: username
Unique: Yes
```

**Email Index:**
```
Name: idx_users_email
Type: BTREE
Columns: email
Unique: Yes
```

### 3.1.4. Drag Movement, Color Change, Editing, and Deletion

#### Moving Tables

1. **Select Mode**: Ensure you're in SELECT mode
2. **Click and Drag**: Click on a table and drag to move it
3. **Fine Positioning**: Use arrow keys for precise positioning

#### Changing Table Colors

1. **Right-click Table**: Access the context menu
2. **Select Color**: Choose from predefined colors or custom colors
3. **Apply**: The table background will update immediately

#### Editing Tables

1. **Double-click**: Double-click on any table to open the edit dialog
2. **Modify Properties**: Update table name, description, columns, or indexes
3. **Save Changes**: Click "OK" to apply all changes

#### Deleting Tables

1. **Select Table**: Click to select the table
2. **Delete Key**: Press the Delete key, or
3. **Context Menu**: Right-click and select "Delete"
4. **Confirm**: Confirm the deletion (this also removes all related relationships)

## 3.2. Relations

Relations define the connections and dependencies between tables in your database.

### 3.2.1. Relation Creation Method

#### Creating a Relationship

1. **Select Relation Mode**
   - Click the **RELATION** button in the edit mode panel

2. **Select Source Table**
   - Click on the table that will be the source of the relationship
   - This is typically the table containing the primary key

3. **Select Target Table**
   - Click on the target table to complete the relationship
   - The relation edit dialog will open

   ![Relation Edit Dialog](../screenshots/relation-edit-dialog.png)

#### Example: Creating Relations for TODO App

**Users to TODO Items Relationship:**
```
Source Table: users (id)
Target Table: todo_items (user_id)
Relationship Type: One-to-Many
Foreign Key: user_id references users(id)
```

### 3.2.2. Relation Settings

#### Relationship Configuration Options

1. **Cardinality**:
   - **One-to-One**: Each record in table A relates to one record in table B
   - **One-to-Many**: Each record in table A can relate to multiple records in table B
   - **Many-to-Many**: Records in both tables can have multiple relationships

2. **Foreign Key Settings**:
   - **Column Mapping**: Define which columns participate in the relationship
   - **On Delete Actions**: CASCADE, RESTRICT, SET NULL, SET DEFAULT
   - **On Update Actions**: CASCADE, RESTRICT, SET NULL, SET DEFAULT

3. **Naming Conventions**:
   - **Relationship Name**: Logical name for the relationship
   - **Foreign Key Name**: Physical constraint name in the database

### 3.2.3. Relation Line Changes

#### Visual Customization

1. **Line Style**: Different styles for different relationship types
2. **Crow's Foot Notation**: Visual indicators for cardinality
3. **Connection Points**: Relations connect to specific columns
4. **Routing**: ERD Designer automatically routes lines to avoid overlaps

#### Editing Existing Relations

1. **Double-click**: Double-click on any relation line
2. **Modify Settings**: Update cardinality, constraints, or naming
3. **Visual Adjustments**: Drag intermediate points to adjust line routing

## 3.3. Memos

Memos provide documentation and notes within your ERD.

### 3.3.1. Memo Creation Overview

#### Creating a Memo

1. **Select Memo Mode**: Click the **MEMO** button
2. **Place Memo**: Click on the canvas where you want the memo
3. **Enter Text**: Type your documentation or notes
4. **Format**: Customize appearance as needed

### 3.3.2. Text Editing Method

#### Editing Memo Content

1. **Double-click**: Double-click on any memo to edit text
2. **Rich Text**: Support for basic formatting options
3. **Multi-line**: Create detailed documentation with line breaks

### 3.3.3. Size Change, Position Movement, Color Change, Font Change, Deletion

#### Memo Customization

1. **Resize**: Drag corner handles to resize memo boxes
2. **Move**: Click and drag to reposition memos
3. **Color**: Right-click to access color options
4. **Font**: Modify font family, size, and style
5. **Delete**: Select and press Delete key

## 3.4. Other Editing Features

### 3.4.1. Column Group Definition

Column groups allow you to organize related columns and reuse common patterns across tables.

#### Creating Column Groups

1. **Access Groups**: Use the "Add group column" feature
2. **Define Patterns**: Create reusable sets of columns
3. **Apply Groups**: Add predefined column groups to tables

#### Example: Common Column Groups

**Audit Columns Group:**
```
created_at: TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at: TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
created_by: INTEGER REFERENCES users(id)
updated_by: INTEGER REFERENCES users(id)
```

### 3.4.2. DDL Import

Import existing database structures from SQL DDL scripts.

#### Importing DDL

1. **Access Import**: Use the DDL import feature from the menu
2. **Paste DDL**: Paste your SQL CREATE TABLE statements
3. **Parse Structure**: ERD Designer will analyze and create tables
4. **Review Results**: Verify imported structure and make adjustments

## 3.5. Other Operations

### 3.5.1. Single Selection, Multiple Selection, Grab Operation

#### Selection Operations

1. **Single Selection**: Click on any element to select it
2. **Multiple Selection**: 
   - Hold Ctrl/Cmd and click multiple elements
   - Drag to create a selection rectangle
3. **Select All**: Use Ctrl+A to select all elements

#### Grab Operation

1. **Activate Grab Mode**: Click the GRAB button
2. **Pan Canvas**: Click and drag to move the entire view
3. **Zoom Navigation**: Useful for navigating large diagrams

### 3.5.2. Default Color Settings

#### Color Management

1. **Access Preferences**: Click the preferences button
2. **Default Colors**: Set default colors for new tables
3. **Color Themes**: Apply consistent color schemes
4. **Custom Colors**: Define custom color palettes

### 3.5.3. Display Style

#### Display Options

1. **Physical Names**: Show database column names only
2. **Logical Names**: Show descriptive names only
3. **Both**: Show both physical and logical names (default)

#### Usage Scenarios

- **Development**: Use physical names for technical accuracy
- **Documentation**: Use logical names for business stakeholders
- **Both**: Comprehensive view for design and review

### 3.5.4. Undo, Redo

#### History Management

1. **Undo**: Ctrl+Z or click Undo button
2. **Redo**: Ctrl+Y or click Redo button
3. **History Depth**: Multiple levels of undo/redo available
4. **Visual Indicators**: Buttons disabled when no actions available

### 3.5.5. DDL Export

#### Generating SQL Scripts

1. **Access Export**: Click Export → "Export DDL"
2. **Database Target**: Choose target database system
3. **Options**: Configure export settings
4. **Generate**: Create SQL CREATE TABLE statements

#### Example DDL Output

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE todo_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 3.5.6. ER Diagram Image Save

#### Exporting Images

1. **Access Export**: Click Export → "Save as image"
2. **Image Format**: PNG format with transparent background
3. **Quality**: High-resolution output suitable for documentation
4. **Download**: Image automatically downloads to your device

![Example ERD Output](../screenshots/example-erd-output.png)

### 3.5.7. Table Definition Document Output

#### Specification Documents

1. **Access Export**: Click Export → "Export specification"
2. **Format**: 
   - Excel file (.xlsx) for online version
   - Google Sheets for Google Drive App
3. **Content**: Comprehensive table definitions with all metadata

#### Document Contents

- Table names and descriptions
- Column definitions with data types
- Primary key and foreign key relationships
- Index definitions
- Constraints and default values

### 3.5.8. ERD File Output (Excluding Google Drive App)

#### Native File Format

1. **Access Export**: Click Export → "Save to ERD file"
2. **File Format**: .erd file containing complete diagram data
3. **Portability**: Files can be shared and imported by other users
4. **Version Control**: Suitable for tracking changes over time

#### File Usage

- **Backup**: Create backups of your work
- **Sharing**: Share diagrams with team members
- **Version Control**: Track changes using Git or other systems
- **Migration**: Move diagrams between online and local installations

---

This comprehensive features guide covers all aspects of ERD Designer functionality. Each feature is designed to support professional database design workflows while maintaining ease of use.

Previous: [Canvas Interface](Canvas-Interface.md) | Back to: [Home](Home.md)