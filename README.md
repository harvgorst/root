# root · crop planner

root is a planner for vegetable plots and allotments. Draw the plot to scale, lay out the beds, plant crops in rows, check the crop rotation from year to year, and see each month's sowing, planting and harvest jobs.

root is a single HTML file. Download `index.html` and open it in a browser (Chrome, Edge, Firefox or Safari); there is nothing to install and no account. It can also be served from any static web host. It is built on the same template and themes as SevenLayers, the planting design tool.

## What it does

- **Plan**: set the plot size, draw beds with the Bed tool, and paths, sheds, greenhouses, compost bays and water butts with the Blocks tool, all as rectangles, then drag out a crop inside a bed. The number of plants comes from the crop's spacing in the row and between rows, and the rows can be turned. A click plants a single plant. Moving a bed moves its crops with it. Undo and redo, arrow-key nudging, Ctrl+D to duplicate, Plant spacing to show where each plant goes, and Last year to show what grew in each bed the year before.
- **Crop list & rotation**: crops, varieties, beds, rows, plant numbers and area, which copy straight into a spreadsheet. Each bed is compared with the previous year's plan on a four-course rotation (Peas & beans → Brassicas → Potatoes → Roots & onions). A bed that repeats a family is flagged on the plan and in the table, and each bed suggests what comes next.
- **Sowing calendar**: this month's jobs (sow under cover, sow outside, plant out, harvest) and a year chart for every crop on the plan, or for the whole library.
- **Crops**: the crop library as a sortable table, searchable and filterable by family, with spacing, months and notes, and a copy for spreadsheets. The library beside the plan has family chips and an On this plan filter.
- **Next season**: Plot details › Start next year's plan copies the beds, paths and perennials into a new year, so the rotation can be checked.
- **Preferences**: a theme (Drafting table, Eiderdown, Woodwork, 98 or root; until one is chosen, it follows the theme picked in SevenLayers), labels, grid, rulers, snap, colours for each crop family, adding back deleted starter crops, and backup and restore.

On first opening it is filled with 31 common crops (typical UK spacings and months, all editable) and an example half plot.

## Files

- `index.html`: the whole app (HTML, CSS and JavaScript in one file).
- `tests/`: automated checks that open the app in a headless browser.

## Storage

Everything is saved in the browser you use, in its IndexedDB storage: plots, the crop library and preferences. Nothing is sent to a server. Backups are ordinary file downloads. Two tabs open on the same copy stay in step.

Because the data lives in that browser, it stays on that computer and in that browser only; clearing the browser's site data deletes it. Use **Preferences → Backup → Download everything** regularly, and to move your work to another computer or browser, then **Restore from a backup file** there. Backups made when root was called "Allotment Plot Planner" or "root planner" still restore.

Fonts load from Google Fonts; everything else works offline.

## Tests

The tests need Node.js and Playwright.

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

To run only some tests, give part of a test's name:

```bash
node tests/smoke.js rotation
```

The tests keep their data in memory (`tests/mock-runtime.js`), so they never touch saved plots.
