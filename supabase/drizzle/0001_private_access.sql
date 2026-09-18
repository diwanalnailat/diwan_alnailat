-- Application records are accessible only through the trusted server.
-- No anonymous/public write policies; no new login flow is introduced.
REVOKE ALL ON TABLE
  public."nl_settings",
  public."nl_members",
  public."nl_bundles",
  public."nl_projects",
  public."nl_tasks",
  public."nl_suppliers",
  public."nl_expenses",
  public."nl_payments",
  public."nl_asset_numbers",
  public."nl_assets",
  public."nl_movements",
  public."nl_files",
  public."nl_comments",
  public."nl_guides",
  public."nl_audit",
  public."nl_notifications",
  public."nl_receipts",
  public."nl_guards",
  public."nl_committees",
  public."nl_advances",
  public."nl_advance_entries",
  public."nl_agent_turns",
  public."nl_otp",
  public."nl_contact_preferences",
  public."nl_delivery_jobs",
  public."nl_integration_limits"
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."nl_settings",
  public."nl_members",
  public."nl_bundles",
  public."nl_projects",
  public."nl_tasks",
  public."nl_suppliers",
  public."nl_expenses",
  public."nl_payments",
  public."nl_asset_numbers",
  public."nl_assets",
  public."nl_movements",
  public."nl_files",
  public."nl_comments",
  public."nl_guides",
  public."nl_audit",
  public."nl_notifications",
  public."nl_receipts",
  public."nl_guards",
  public."nl_committees",
  public."nl_advances",
  public."nl_advance_entries",
  public."nl_agent_turns",
  public."nl_otp",
  public."nl_contact_preferences",
  public."nl_delivery_jobs",
  public."nl_integration_limits"
TO service_role;

REVOKE ALL ON SEQUENCE public.nl_asset_numbers_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.nl_asset_numbers_number_seq TO service_role;
