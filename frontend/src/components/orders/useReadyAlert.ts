"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Permission = "default" | "granted" | "denied" | "unsupported";

function currentPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as Permission;
}

/**
 * Alerts the fan when their order turns ready: a system notification if they
 * allowed one, plus a vibration on phones that support it.
 *
 * This is a local notification raised while the app is open or in a
 * background tab. Push notifications to a closed app would need a push
 * service, which this project does not run.
 */
export function useReadyAlert(status: string | undefined, orderLabel: string, place: string) {
  // The browser's permission, read after hydration (the server has no
  // Notification API), then whatever the fan chose in this session.
  const browserPermission = useSyncExternalStore(
    () => () => undefined,
    currentPermission,
    () => "unsupported" as Permission
  );
  const [chosen, setChosen] = useState<Permission | null>(null);
  const permission = chosen ?? browserPermission;
  const previous = useRef(status);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (status !== "ready" || was === "ready" || was === undefined) return;
    try {
      navigator.vibrate?.([180, 80, 180]);
    } catch {
      // Not supported.
    }
    if (currentPermission() === "granted") {
      try {
        new Notification("Your order is ready", {
          body: `${orderLabel} is waiting at ${place}.`,
          icon: "/icons/icon-192.png",
          tag: "pitstop-order-ready",
        });
      } catch {
        // Some mobile browsers only allow notifications from a service worker.
        navigator.serviceWorker?.ready
          .then((reg) =>
            reg.showNotification("Your order is ready", {
              body: `${orderLabel} is waiting at ${place}.`,
              icon: "/icons/icon-192.png",
              tag: "pitstop-order-ready",
            })
          )
          .catch(() => undefined);
      }
    }
  }, [status, orderLabel, place]);

  const request = useCallback(async () => {
    if (currentPermission() === "unsupported") return;
    const result = await Notification.requestPermission();
    setChosen(result as Permission);
  }, []);

  return { permission, request };
}
