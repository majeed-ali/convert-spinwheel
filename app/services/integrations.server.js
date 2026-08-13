import crypto from "crypto";

/**
 * Integrations handler for Klaviyo, Mailchimp, and SendGrid
 */
export async function syncLeadToIntegrations(shop, leadData) {
  const { email, phone, wonCode, wonDiscountLabel } = leadData;
  if (!email) return { success: false, reason: "No email provided" };

  const cleanEmail = email.trim().toLowerCase();
  const results = {
    klaviyo: null,
    mailchimp: null,
    sendgrid: null,
  };

  // ==========================================
  // 1. KLAVIYO INTEGRATION (Profile + List Sync)
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
                Source: "Convert Spin Wheel",
              },
            },
          },
        }),
      });

      let profileId = null;
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        profileId = profileData.data?.id;
      } else if (profileRes.status === 409) {
        // Profile already exists -> fetch profile ID by email filter
        const filterUrl = `https://a.klaviyo.com/api/profiles/?filter=equals(email,"${encodeURIComponent(cleanEmail)}")`;
        const searchRes = await fetch(filterUrl, { headers });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          profileId = searchData.data?.[0]?.id;
        }
      }

      // Step 1B: Add Profile to First Klaviyo List (Audience)
      if (profileId) {
        const listsRes = await fetch("https://a.klaviyo.com/api/lists/", { headers });
        if (listsRes.ok) {
          const listsData = await listsRes.json();
          const targetListId = listsData.data?.[0]?.id;

          if (targetListId) {
            await fetch(`https://a.klaviyo.com/api/lists/${targetListId}/relationships/profiles/`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                data: [{ type: "profile", id: profileId }],
              }),
            });
          }
        }
      }

      results.klaviyo = true;
      console.log(`[Klaviyo Sync Success] ${cleanEmail}`);
    } catch (e) {
      console.error("[Klaviyo Sync Error]:", e);
      results.klaviyo = false;
    }
  }

  // ==========================================
  // 2. MAILCHIMP INTEGRATION (Audience Member Upsert)
  // ==========================================
  if (shop.mailchimpApiKey) {
    try {
      const apiKey = shop.mailchimpApiKey.trim();
      const datacenter = apiKey.split("-")[1] || "us1";
      const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

      // Step 2A: Get First Mailchimp Audience / List ID
      const listsUrl = `https://${datacenter}.api.mailchimp.com/3.0/lists?count=5`;
      const listRes = await fetch(listsUrl, {
        headers: { Authorization: authHeader },
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        const defaultListId = listData.lists?.[0]?.id;

        if (defaultListId) {
          // MD5 hash of lowercase email for Mailchimp Upsert Endpoint
          const subscriberHash = crypto.createHash("md5").update(cleanEmail).digest("hex");
          const memberUrl = `https://${datacenter}.api.mailchimp.com/3.0/lists/${defaultListId}/members/${subscriberHash}`;

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
            }),
          });

          results.mailchimp = upsertRes.ok;
          if (upsertRes.ok) {
            console.log(`[Mailchimp Sync Success] ${cleanEmail}`);
          } else {
            const errBody = await upsertRes.text();
            console.error("[Mailchimp Sync Response Error]:", errBody);
          }
        }
      } else {
        console.error("[Mailchimp List Fetch Error]:", await listRes.text());
      }
    } catch (e) {
      console.error("[Mailchimp Sync Error]:", e);
      results.mailchimp = false;
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
          contacts: [
            {
              email: cleanEmail,
            },
          ],
        }),
      });
      results.sendgrid = response.ok;
    } catch (e) {
      console.error("[SendGrid Sync Error]:", e);
      results.sendgrid = false;
    }
  }

  return results;
}
