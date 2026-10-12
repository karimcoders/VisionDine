import re

# 1) page.tsx
p = 'src/app/page.tsx'
s = open(p).read()
old = '''  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("qr") === "menu") {
      const t = params.get("table");
      setQr({ kind: "menu", table: t ? Number(t) : null });
    } else if (params.get("qr") === "status") {
      setQr({ kind: "status", orderNo: params.get("orderNo") || "" });
    }
    api<{ auth: Auth | null }>("/api/auth")
      .then((res) => {
        if (res.auth) setAuth(res.auth);
      })
      .catch(() => undefined)
      .finally(() => setBooted(true));
  }, [setAuth]);'''
new = '''  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    api<{ auth: Auth | null }>("/api/auth")
      .then((res) => {
        if (res.auth) setAuth(res.auth);
      })
      .catch(() => undefined)
      .finally(() => {
        // decide QR/customer mode after boot (async callback keeps first paint stable)
        if (params.get("qr") === "menu") {
          const t = params.get("table");
          setQr({ kind: "menu", table: t ? Number(t) : null });
        } else if (params.get("qr") === "status") {
          setQr({ kind: "status", orderNo: params.get("orderNo") || "" });
        }
        setBooted(true);
      });
  }, [setAuth]);'''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)

# 2) receipt.tsx
p = 'src/components/visiondine/receipt.tsx'
s = open(p).read()
old = '''export function ReceiptModal({ orderId, open, onClose }: { orderId: string | null; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ReceiptDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId || !open) return;
    setLoading(true);
    api<ReceiptDTO>(`/api/orders/${orderId}/receipt`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [orderId, open]);'''
new = '''export function ReceiptModal({ orderId, open, onClose }: { orderId: string | null; open: boolean; onClose: () => void }) {
  const [cache, setCache] = useState<{ id: string; data: ReceiptDTO | null } | null>(null);
  const loading = !!orderId && open && cache?.id !== orderId;

  useEffect(() => {
    if (!orderId || !open || cache?.id === orderId) return;
    let cancelled = false;
    api<ReceiptDTO>(`/api/orders/${orderId}/receipt`)
      .then((d) => {
        if (!cancelled) setCache({ id: orderId, data: d });
      })
      .catch(() => {
        if (!cancelled) setCache({ id: orderId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, open, cache?.id]);'''
assert old in s
s = s.replace(old, new)
old = '''          ) : data ? (
            <ReceiptPaper data={data} />
          ) : ('''
new = '''          ) : cache?.data ? (
            <ReceiptPaper data={cache.data} />
          ) : ('''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)

# 3) settings.tsx
p = 'src/components/visiondine/settings.tsx'
s = open(p).read()
old = '''  const [tab, setTab] = useState<(typeof TABS)[number]>("restaurant");
  const [profile, setProfile] = useState<SettingsDTO["profile"] | null>(null);
  const [tax, setTax] = useState<SettingsDTO["tax"] | null>(null);
  const [receipt, setReceipt] = useState<SettingsDTO["receipt"] | null>(null);
  const [hours, setHours] = useState<SettingsDTO["hours"] | null>(null);
  const [loyalty, setLoyalty] = useState<SettingsDTO["loyalty"] | null>(null);

  useEffect(() => {
    if (!settings) return;
    setProfile(settings.profile);
    setTax(settings.tax);
    setReceipt(settings.receipt);
    setHours(settings.hours);
    setLoyalty(settings.loyalty);
  }, [settings]);'''
new = '''  const [tab, setTab] = useState<(typeof TABS)[number]>("restaurant");'''
assert old in s
s = s.replace(old, new)

old = '''        {tab === "restaurant" && profile && tax && hours && loyalty && receipt && ('''
new = '''        {tab === "restaurant" && settings && <RestaurantForms key={JSON.stringify(settings)} settings={settings} onSave={save} />}

        {false && profile && tax && hours && loyalty && receipt && ('''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
print("done")
