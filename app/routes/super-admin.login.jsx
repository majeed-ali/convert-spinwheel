import { redirect } from "react-router";
import { useActionData, Form } from "react-router";

export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (cookieHeader.includes("dev_admin_session=true")) {
    return redirect("/super-admin");
  }
  return null;
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const password = formData.get("password");
  const expectedPassword = process.env.DEVELOPER_ADMIN_PASSWORD || "admin123";

  if (password === expectedPassword) {
    return redirect("/super-admin", {
      headers: {
        "Set-Cookie": "dev_admin_session=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400",
      },
    });
  }

  return { error: "Invalid developer password. Please try again." };
};

export default function SuperAdminLogin() {
  const actionData = useActionData();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0F172A",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#F8FAFC",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "#1E293B",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid #334155",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 16px auto",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              boxShadow: "0 10px 20px rgba(99, 102, 241, 0.3)",
            }}
          >
            🔒
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", margin: "0 0 6px 0", color: "#FFFFFF" }}>
            Developer Super Admin
          </h1>
          <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
            ConvertSpin Platform & Merchant Management
          </p>
        </div>

        {actionData?.error && (
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid #EF4444",
              color: "#FCA5A5",
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            {actionData.error}
          </div>
        )}

        <Form method="post">
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#CBD5E1", marginBottom: "8px" }}
            >
              Developer Admin Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="Enter secret password"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                backgroundColor: "#0F172A",
                border: "1px solid #475569",
                borderRadius: "8px",
                color: "#FFFFFF",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#6366F1",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            Sign In to Developer Portal →
          </button>
        </Form>

        <div style={{ marginTop: "24px", textAlign: "center", fontSize: "12px", color: "#64748B" }}>
          Set <code>DEVELOPER_ADMIN_PASSWORD</code> in your <code>.env</code> file.
        </div>
      </div>
    </div>
  );
}
