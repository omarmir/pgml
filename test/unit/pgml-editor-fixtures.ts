const baseVersionSnapshot = `Table public.users {
  id uuid [pk]
}`

const workspaceVersionSnapshot = `Table public.users {
  id uuid [pk]
  email text [unique]
}`

export const validVersionedEditorSource = `VersionSet "Billing" {
  Workspace {
    based_on: v2
    updated_at: "2026-03-29T14:12:00.000Z"

    Snapshot {
${workspaceVersionSnapshot.split('\n').map(line => `      ${line}`).join('\n')}

      Ref: public.users.id > public.users.id
    }
  }

  Version v1 {
    name: "Initial implementation"
    role: implementation
    created_at: "2026-03-20T15:00:00.000Z"

    Snapshot {
${baseVersionSnapshot.split('\n').map(line => `      ${line}`).join('\n')}
    }
  }

  Version v2 {
    name: "Workspace base"
    role: design
    parent: v1
    created_at: "2026-03-24T10:30:00.000Z"

    Snapshot {
${workspaceVersionSnapshot.split('\n').map(line => `      ${line}`).join('\n')}
    }
  }
}`

export const buildVersionedCompletionFixture = (body: string) => {
  return `VersionSet "Billing" {
${body}
}`
}
