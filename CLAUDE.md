# Working on root

- root is the crop planner: a vegetable-plot and allotment planner in one HTML file, `index.html`. The name is always lower case, with "crop planner" as its tag line.
- It shares its themes and template with SevenLayers (the planting design tool in `harvgorst/plantingdesigntool`). Keep the themes in step when SevenLayers' themes change.
- The user tests the tool live from GitHub (served from `main`) and refreshes after each change. So commit finished changes straight to `main` and push, unless told otherwise; do not leave them on a side branch.
- Run the tests with `node tests/smoke.js` (or a name filter as the argument).
