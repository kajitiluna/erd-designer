# Wiki Migration Guide

This guide explains how to migrate the ERD Designer manual to the GitHub Wiki repository.

## Migration Steps

### 1. Clone the Wiki Repository

```bash
git clone https://github.com/kajitiluna/erd-designer.wiki.git
cd erd-designer.wiki
```

### 2. Copy Manual Files

Copy the following files from this repository to the Wiki repository:

```bash
# From this repository's manual/ directory, copy:
cp manual/en/*.md wiki-repo/
cp manual/ja/*.md wiki-repo/
```

### 3. Rename Files for Wiki

GitHub Wiki requires specific naming conventions:

- `manual/en/Home.md` → `Home.md` (main page)
- `manual/en/Getting-Started.md` → `Getting-Started.md`
- `manual/en/Canvas-Interface.md` → `Canvas-Interface.md`
- `manual/en/Features-Guide.md` → `Features-Guide.md`

For Japanese versions:
- `manual/ja/Home.md` → `Home-Japanese.md`
- `manual/ja/Getting-Started.md` → `Getting-Started-Japanese.md`
- `manual/ja/Canvas-Interface.md` → `Canvas-Interface-Japanese.md`
- `manual/ja/Features-Guide.md` → `Features-Guide-Japanese.md`

### 4. Create Screenshots

Capture screenshots from the ERD Designer application (https://kajitiluna.github.io/erd-designer):

**Important**: Position all tables and work at the CENTER of the canvas before taking screenshots.

Required screenshots:
- `startup-page.png`
- `create-new-dialog.png`
- `main-canvas-interface.png`
- `select-icon.png`
- `grab-icon.png`
- `table-icon.png`
- `relation-icon.png`
- `memo-icon.png`
- `export-menu.png`
- `table-creation-dialog.png`
- `column-edit-dialog.png`
- `relation-edit-dialog.png`
- `example-erd-output.png`

### 5. Upload Screenshots

Upload all screenshots to the Wiki repository. GitHub Wiki supports uploading images directly through the web interface.

### 6. Update Image References

Update all image references in the markdown files to use the uploaded screenshots:

Change from:
```markdown
![Description](../screenshots/image-name.png)
```

To:
```markdown
![Description](https://github.com/kajitiluna/erd-designer/wiki/uploads/image-name.png)
```

Or use relative paths if GitHub Wiki supports them in your setup.

### 7. Test Navigation

Ensure all internal links between pages work correctly in the Wiki environment.

## TODO Application Example

When creating screenshots, use this consistent example:

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

Position these tables at the center of the canvas with a relationship line between them when capturing screenshots.