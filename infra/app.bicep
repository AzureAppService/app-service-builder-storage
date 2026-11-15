targetScope = 'resourceGroup'

@description('Unique name for a new source-less Builder App; do not rerun over a configured app.')
param appName string
@allowed(['westus2'])
param location string = 'westus2'

resource app 'Microsoft.Web/builderApps@2026-09-01-preview' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    versionConfiguration: {
      variables: [
        { name: 'APP_ACCESS_MODE', value: 'builder' }
      ]
    }
    scaling: {
      components: [
        { name: 'api', minReplicas: 1, maxReplicas: 2, httpEnabled: true }
      ]
    }
  }
}

output appResourceId string = app.id
output principalId string = app.identity.principalId
