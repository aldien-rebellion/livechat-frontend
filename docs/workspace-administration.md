# Workspace administration

Global administrators can create workspaces. Any signed-in member can create a
channel inside an existing workspace. Delete controls use the backend's
`can_manage` permission: a global administrator, workspace owner, or workspace
administrator may delete a channel or its workspace.

Deletion requires typing the selected name. Cancel makes no request. The dialog
stays open if the request fails. Deleting a channel removes its messages;
deleting a workspace removes all channel/message content inside it.

Live workspace/channel lists come from the backend, including removals, and
refresh every three seconds and on window focus. The page chooses another
available room after a deletion, or shows an empty state. Live chat history is
loaded from the authenticated backend rather than the old browser message cache.

Deploy the companion backend first and run its migrations and administrator
grants. Old sessions must sign in again; the login response includes `is_admin`.
The browser hides unauthorized controls, and the backend independently enforces
permissions. A Grafana administrator account does not grant Live Chat privileges.
