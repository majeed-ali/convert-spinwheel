import crypto from "crypto";

/**
 * Integrations handler for Klaviyo, Mailchimp, and SendGrid
 */
export async function syncLeadToIntegrations(shop, leadData) {
  const { email, phone, wonCode, wonDiscountLabel } = leadData;
  if (!email) return { success: false, reason: "No email provided" };

  const cleanEmail = email.trim().toLowerCase();
  const results = {
    klaviyo: { success: false, message: "Not configured" },
    mailchimp: { success: false, message: "Not configured" },
    sendgrid: { success: false, message: "Not configured" },
  };

  const tagLabel = "shopify-convert-spin-wheel";

  // ==========================================
  // 1. KLAVIYO INTEGRATION (Profile + List Sync + Tag)
  // ==========================================
  if (shop.klaviyoApiKey) {
    try {
      const apiKey = shop.klaviyoApiKey.trim();
      const headers = {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        revision: "2023-10-15",
      };

      // Step 1A: Create or update Klaviyo Profile
      const profileRes = await fetch("https://a.klaviyo.com/api/profiles/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "profile",
            attributes: {
              email: cleanEmail,
              phone_number: phone ? phone.trim() : undefined,
              properties: {
                SpinWheel_WonCode: wonCode || "",
                SpinWheel_WonDiscount: wonDiscountLabel || "",
                Source: tagLabel,
                Tag: tagLabel,
              },
            },
          },
        }),
      });

      let profileId = null;
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        profileId = profileData.data?.id;
      } else {
        const errJson = await profileRes.json().catch(() => null);
        if (profileRes.status === 409 || errJson?.errors?.[0]?.code === "duplicate_profile") {
          profileId = errJson?.errors?.[0]?.meta?.duplicate_profile_id;

          if (!profileId) {
            // Fallback search filter
            const filterUrl = `https://a.klaviyo.com/api/profiles/?filter=equals(email,"${encodeURIComponent(cleanEmail)}")`;
            const searchRes = await fetch(filterUrl, { headers });
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              profileId = searchData.data?.[0]?.id;
            }
          }
        } else {
          console.error("[Klaviyo Profile Create Failed]:", errJson);
          results.klaviyo = { success: false, message: `Klaviyo error: ${profileRes.statusText}` };
        }
      }

      // Step 1B: Add Profile to First Klaviyo List (Audience)
      if (profileId) {
        const listsRes = await fetch("https://a.klaviyo.com/api/lists/", { headers });
        if (listsRes.ok) {
          const listsData = await listsRes.json();
          const targetListId = listsData.data?.[0]?.id;

          if (targetListId) {
            const addToListRes = await fetch(`https://a.klaviyo.com/api/lists/${targetListId}/relationships/profiles/`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                data: [{ type: "profile", id: profileId }],
              }),
            });

            if (addToListRes.ok || addToListRes.status === 204) {
              results.klaviyo = { success: true, message: `Synced to Klaviyo List (${targetListId})` };
            } else {
              results.klaviyo = { success: true, message: `Profile created in Klaviyo` };
            }
          } else {
            results.klaviyo = { success: true, message: "Profile created in Klaviyo" };
          }
        } else {
          results.klaviyo = { success: true, message: "Profile created in Klaviyo" };
        }
      }
    } catch (e) {
      console.error("[Klaviyo Sync Error]:", e);
      results.klaviyo = { success: false, message: e.message };
    }
  }

  // ==========================================
  // 2. MAILCHIMP INTEGRATION (Audience Member Upsert + Tag)
  // ==========================================
  if (shop.mailchimpApiKey) {
    try {
      const apiKey = shop.mailchimpApiKey.trim();
      const datacenter = apiKey.split("-")[1] || "us1";
      const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

      const listsUrl = `https://${datacenter}.api.mailchimp.com/3.0/lists?count=10`;
      const listRes = await fetch(listsUrl, {
        headers: { Authorization: authHeader },
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        const defaultList = listData.lists?.[0];

        if (defaultList && defaultList.id) {
          const subscriberHash = crypto.createHash("md5").update(cleanEmail).digest("hex");
          const memberUrl = `https://${datacenter}.api.mailchimp.com/3.0/lists/${defaultList.id}/members/${subscriberHash}`;

          const upsertRes = await fetch(memberUrl, {
            method: "PUT",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email_address: cleanEmail,
              status_if_new: "subscribed",
              status: "subscribed",
              skip_merge_validation: true,
              tags: [tagLabel],
            }),
          });

          if (upsertRes.ok) {
            const tagUrl = `https://${datacenter}.api.mailchimp.com/3.0/lists/${defaultList.id}/members/${subscriberHash}/tags`;
            await fetch(tagUrl, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                tags: [{ name: tagLabel, status: "active" }],
              }),
            });

            results.mailchimp = { success: true, message: `Subscribed to Audience "${defaultList.name}" with tag "${tagLabel}"` };
          } else {
            const errData = await upsertRes.json().catch(() => null);
            const detailMsg = errData?.detail || errData?.title || upsertRes.statusText;
            console.error("[Mailchimp Member Upsert Failed]:", errData);
            results.mailchimp = { success: false, message: `Mailchimp error: ${detailMsg}` };
          }
        } else {
          results.mailchimp = { success: false, message: "No Audience lists found in Mailchimp account" };
        }
      } else {
        const errText = await listRes.text();
        console.error("[Mailchimp Auth/List Error]:", errText);
        results.mailchimp = { success: false, message: "Invalid Mailchimp API Key or Datacenter" };
      }
    } catch (e) {
      console.error("[Mailchimp Sync Error]:", e);
      results.mailchimp = { success: false, message: e.message };
    }
  }

  // ==========================================
  // 3. SENDGRID INTEGRATION
  // ==========================================
  if (shop.sendgridApiKey) {
    try {
      const apiKey = shop.sendgridApiKey.trim();
      const response = await fetch("https://api.sendgrid.com/v3/marketing/contacts", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contacts: [{ email: cleanEmail }],
        }),
      });
      if (response.ok) {
        results.sendgrid = { success: true, message: "Contact added to SendGrid" };
      } else {
        results.sendgrid = { success: false, message: `SendGrid error: ${response.statusText}` };
      }
    } catch (e) {
      console.error("[SendGrid Sync Error]:", e);
      results.sendgrid = { success: false, message: e.message };
    }
  }

  return results;
}

/**
 * Validate API keys without creating fake test contacts in merchant audience lists
 */
export async function testIntegrationKeys(shop) {
  const results = {
    klaviyo: { success: false, message: "Not configured" },
    mailchimp: { success: false, message: "Not configured" },
    sendgrid: { success: false, message: "Not configured" },
  };

  if (shop.klaviyoApiKey) {
    try {
      const apiKey = shop.klaviyoApiKey.trim();
      const res = await fetch("https://a.klaviyo.com/api/lists/", {
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          revision: "2023-10-15",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const listName = data.data?.[0]?.attributes?.name || "Klaviyo List";
        results.klaviyo = { success: true, message: `API Key Validated (Connected to list "${listName}")` };
      } else {
        results.klaviyo = { success: false, message: `Invalid Klaviyo API Key (${res.statusText})` };
      }
    } catch (e) {
      results.klaviyo = { success: false, message: e.message };
    }
  }

  if (shop.mailchimpApiKey) {
    try {
      const apiKey = shop.mailchimpApiKey.trim();
      const datacenter = apiKey.split("-")[1] || "us1";
      const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;
      const res = await fetch(`https://${datacenter}.api.mailchimp.com/3.0/lists?count=5`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json();
        const audienceName = data.lists?.[0]?.name || "Mailchimp Audience";
        results.mailchimp = { success: true, message: `API Key Validated (Connected to audience "${audienceName}")` };
      } else {
        results.mailchimp = { success: false, message: `Invalid Mailchimp API Key` };
      }
    } catch (e) {
      results.mailchimp = { success: false, message: e.message };
    }
  }

  return results;
}
