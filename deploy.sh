#!/bin/bash
# =============================================================
# Intune Command Center — Azure Deployment Script
# Team 2 / CloudGuard Consulting
# =============================================================
# Usage:
#   1. Fill in your Entra ID credentials below
#   2. Run: chmod +x deploy.sh && ./deploy.sh
# =============================================================

set -e

# ── Configuration ────────────────────────────────────────────
RESOURCE_GROUP="intune-chatbot-rg"
LOCATION="eastus"
APP_NAME="intune-command-center"
KEYVAULT_NAME="intune-chatbot-kv"

# Fill these in after creating your Entra ID app registration
CLIENT_ID="<your-client-id>"
TENANT_ID="<your-tenant-id>"
CLIENT_SECRET="<your-client-secret>"

# ── 1. Login ─────────────────────────────────────────────────
echo "Logging in to Azure..."
az login

# ── 2. Create Resource Group ────────────────────────────────
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# ── 3. Create App Service (Backend API) ─────────────────────
echo "Creating App Service plan and web app..."
az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group $RESOURCE_GROUP \
  --sku F1 \
  --is-linux

az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:20-lts"

# ── 4. Enable Managed Identity ──────────────────────────────
echo "Enabling managed identity..."
az webapp identity assign \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP

# ── 5. Create Key Vault ─────────────────────────────────────
echo "Creating Key Vault..."
az keyvault create \
  --name $KEYVAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Grant App Service access to Key Vault
PRINCIPAL_ID=$(az webapp identity show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $PRINCIPAL_ID \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEYVAULT_NAME"

# ── 6. Store Secrets ────────────────────────────────────────
echo "Storing secrets in Key Vault..."
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name "INTUNE-CLIENT-ID" --value "$CLIENT_ID"

az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name "INTUNE-TENANT-ID" --value "$TENANT_ID"

az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name "INTUNE-CLIENT-SECRET" --value "$CLIENT_SECRET"

# ── 7. Link Key Vault to App Settings ───────────────────────
echo "Linking Key Vault references to app settings..."
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    CLIENT_ID="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=INTUNE-CLIENT-ID)" \
    TENANT_ID="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=INTUNE-TENANT-ID)" \
    CLIENT_SECRET="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=INTUNE-CLIENT-SECRET)"

# ── 8. Deploy Backend Code ──────────────────────────────────
echo "Deploying backend to Azure..."
cd backend
az webapp up \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --runtime "NODE:20-lts"

az webapp config set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --startup-file "node server.js"

# ── 9. Security Hardening ───────────────────────────────────
echo "Enabling HTTPS-only..."
az webapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --https-only true

echo "Enabling diagnostic logging..."
az webapp log config \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --application-logging filesystem \
  --level information

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Deployment complete!"
echo "============================================="
echo "  Backend: https://${APP_NAME}.azurewebsites.net"
echo "  Health:  https://${APP_NAME}.azurewebsites.net/api/health"
echo ""
echo "  Next steps:"
echo "    1. Verify: curl https://${APP_NAME}.azurewebsites.net/api/health"
echo "    2. Deploy frontend to Azure Static Web Apps"
echo "    3. Set CORS: az webapp cors add --name $APP_NAME --resource-group $RESOURCE_GROUP --allowed-origins \"https://your-frontend.azurestaticapps.net\""
echo "============================================="
