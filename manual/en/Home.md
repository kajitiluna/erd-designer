# ERD Designer Manual

Welcome to the Entity Relationship Diagram Designer (ERD Designer) manual. This comprehensive guide will help you understand and utilize all the features of ERD Designer effectively.

## Table of Contents

1. [Overview](#1-overview)
   - 1.1. [What is ERD Designer](#11-what-is-erd-designer)
   - 1.2. [Delivery Format](#12-delivery-format)
     - 1.2.1. [Online Service (Direct GitHub Pages Access)](#121-online-service-direct-github-pages-access)
     - 1.2.2. [Google Drive App](#122-google-drive-app)

2. [Getting Started](Getting-Started.md)
   - 2.1. [Online Service (Direct GitHub Pages Access)](Getting-Started.md#21-online-service-direct-github-pages-access)
   - 2.2. [Google Drive App](Getting-Started.md#22-google-drive-app)
   - 2.3. [Canvas Interface](Canvas-Interface.md)
     - 2.3.1. [About Each Menu](Canvas-Interface.md#231-about-each-menu)

3. [Features Guide](Features-Guide.md)
   - 3.1. [Tables](Features-Guide.md#31-tables)
     - 3.1.1. [Table Creation Overview](Features-Guide.md#311-table-creation-overview)
     - 3.1.2. [Adding, Editing, and Deleting Columns](Features-Guide.md#312-adding-editing-and-deleting-columns)
     - 3.1.3. [Adding, Editing, and Deleting Indexes](Features-Guide.md#313-adding-editing-and-deleting-indexes)
     - 3.1.4. [Drag Movement, Color Change, Editing, and Deletion](Features-Guide.md#314-drag-movement-color-change-editing-and-deletion)
   - 3.2. [Relations](Features-Guide.md#32-relations)
     - 3.2.1. [Relation Creation Method](Features-Guide.md#321-relation-creation-method)
     - 3.2.2. [Relation Settings](Features-Guide.md#322-relation-settings)
     - 3.2.3. [Relation Line Changes](Features-Guide.md#323-relation-line-changes)
   - 3.3. [Memos](Features-Guide.md#33-memos)
     - 3.3.1. [Memo Creation Overview](Features-Guide.md#331-memo-creation-overview)
     - 3.3.2. [Text Editing Method](Features-Guide.md#332-text-editing-method)
     - 3.3.3. [Size Change, Position Movement, Color Change, Font Change, Deletion](Features-Guide.md#333-size-change-position-movement-color-change-font-change-deletion)
   - 3.4. [Other Editing Features](Features-Guide.md#34-other-editing-features)
     - 3.4.1. [Column Group Definition](Features-Guide.md#341-column-group-definition)
     - 3.4.2. [DDL Import](Features-Guide.md#342-ddl-import)
   - 3.5. [Other Operations](Features-Guide.md#35-other-operations)
     - 3.5.1. [Single Selection, Multiple Selection, Grab Operation](Features-Guide.md#351-single-selection-multiple-selection-grab-operation)
     - 3.5.2. [Default Color Settings](Features-Guide.md#352-default-color-settings)
     - 3.5.3. [Display Style](Features-Guide.md#353-display-style)
     - 3.5.4. [Undo, Redo](Features-Guide.md#354-undo-redo)
     - 3.5.5. [DDL Export](Features-Guide.md#355-ddl-export)
     - 3.5.6. [ER Diagram Image Save](Features-Guide.md#356-er-diagram-image-save)
     - 3.5.7. [Table Definition Document Output](Features-Guide.md#357-table-definition-document-output)
     - 3.5.8. [ERD File Output (Excluding Google Drive App)](Features-Guide.md#358-erd-file-output-excluding-google-drive-app)

## 1. Overview

### 1.1. What is ERD Designer

Entity Relationship Diagram Designer (ERD Designer) is a web-based tool for designing entity relationship diagrams. This tool is inspired by [ERMaster](https://ermaster.sourceforge.net/index.html).

ERD Designer provides the following features:

- **Graphical Interface**: ERD Designer allows you to design database tables and relationships via a graphical interface.
- **Export Capabilities**: ERD Designer supports exporting PNG images and generating DDL files.
- **Column Model Reuse**: ERD Designer supports reusing and sharing column models for table design.

### 1.2. Delivery Format

ERD Designer is provided in two different formats to suit various user needs.

#### 1.2.1. Online Service (Direct GitHub Pages Access)

ERD Designer is available as an online tool at: [kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)

This online tool stores your data locally on your machine instead of online, ensuring your privacy and data security.

#### 1.2.2. Google Drive App

ERD Designer is also available as a Google Drive App. By installing the ERD Designer app from the [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491) into your Google Workspace, you can save and edit your work on Google Drive using ERD Designer.

**Important Notes for the Google Drive App:**
- If a file on Google Drive is shared, it can be viewed simultaneously in ERD Designer; however, simultaneous editing is not supported. Due to optimistic concurrency control, the content saved first will be preserved.
- While the online tool allows the Specification Document to be downloaded as an Excel file, the Google Drive App exports it as a spreadsheet.

---

Continue to: [Getting Started](Getting-Started.md)