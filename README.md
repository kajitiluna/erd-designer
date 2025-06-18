<img src="src/logo.svg" alt="logo" width="200" style="display: block; margin: 20 auto;">

# Entity Relationship Diagram Designer

Entity Relationship Diagram Designer (ERD Designer) is a web-based tool for designing entity relationship diagrams.
This tool is inspired by [ERMaster](https://ermaster.sourceforge.net/index.html).

## Features

- ERD Designer allows you to design database tables and relationships via a graphical interface.
- ERD Designer supports exporting PNG images and generating DDL files.
- ERD Designer supports reusing and sharing column models for table design.

## Online tool

ERD Designer is available as an online tool at: [kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)

This online tool stores your data locally on your machine instead of online.

## Google Drive App

ERD Designer is also available as a Google Drive App.  
By installing the ERD Designer app from the [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491) into your Google Workspace, you can save and edit your work on Google Drive using ERD Designer.

### Important Notes for the Google Drive App

- If a file on Google Drive is shared, it can be viewed simultaneously in ERD Designer; however, simultaneous editing is not supported. Due to optimistic concurrency control, the content saved first will be preserved.
- While the online tool allowed the Specification Document to be downloaded as an Excel file, the Google Drive App now exports it as a spreadsheet.

## Manual

Under preparation.

## Installation and Usage

### Local Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/kajitiluna/erd-designer.git
   ```

1. Install dependencies:

   ```sh
   npm ci
   ```

1. Start the development server:

   ```sh
   npm run dev
   ```

### Usage

After starting the development server, open your browser and navigate to http://localhost:5173 to use the application.

## Development

- Node.js Requirement: Ensure you have Node.js (version 22.12 or higher) installed.
- Build the Project:
  ```sh
  npm run build
  ```
- Run Tests:
  ```sh
  npm run testrun
  ```

## Contributing

The contributing guidelines are currently under preparation.
Please check back later for detailed instructions.

## License

ERD Designer is distributed under the Apache License 2.0.
