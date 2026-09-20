# Canvas inspector on selection

## Requirements

The main infinite canvas property inspector stays hidden until a node is selected.
Clearing selection with a pane click or closing the inspector hides it again.
The desktop canvas uses the released horizontal space; node properties remain editable.
Keep existing mobile overlay behavior and node-library visibility controls.

## Acceptance

- Initial load and workflow changes show no empty inspector.
- Selecting nodes shows their properties; close and pane click hide the inspector.
- Desktop layouts reclaim width with the node library either open or closed.
- Desktop and mobile layouts have no horizontal document overflow.
- Existing deterministic baseline and isolated browser checks pass.
