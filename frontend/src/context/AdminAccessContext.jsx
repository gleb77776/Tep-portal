import { createContext, useContext } from 'react';

/** Права админки: один запрос /access в App + защита маршрутов /admin/*. */
export const AdminAccessContext = createContext({
  canAccessAdmin: false,
  adminAccessReady: false,
  adminAccess: null,
});

export function useAdminAccessContext() {
  return useContext(AdminAccessContext);
}
