-- ChatGPT MCP connections are full-app connections.
-- Existing and new active connections should expose every supported FitLife scope.

update public.chatgpt_connections
set scopes = array[
  'fitlife.profile.read',
  'fitlife.profile.write',
  'fitlife.summary.read',
  'fitlife.nutrition.write',
  'fitlife.training.write',
  'fitlife.progress.write',
  'fitlife.wellness.write',
  'fitlife.admin',
  'fitlife.all'
]::text[]
where scopes is distinct from array[
  'fitlife.profile.read',
  'fitlife.profile.write',
  'fitlife.summary.read',
  'fitlife.nutrition.write',
  'fitlife.training.write',
  'fitlife.progress.write',
  'fitlife.wellness.write',
  'fitlife.admin',
  'fitlife.all'
]::text[];
