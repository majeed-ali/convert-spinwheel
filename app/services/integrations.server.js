/**
 * Integrations handler for Klaviyo, Mailchimp, and SendGrid
 */
export async function syncLeadToIntegrations(shop, leadData) {
  const { email, phone, wonCode, wonDiscountLabel } = leadData;

  const results = {
    klaviyo: null,
    mailchimp: null,
    sendgrid: null,
  };

  // 1. Klaviyo Profiles Sync
  if (shop.klaviyoApiKey && email) {
    try {
      const response = await fetch("https://a.klaviyo.com/api/profiles/", {
        method: "POST",
        headers: {
          Authorization: `Klaviyo-API-Key ${shop.klaviyoApiKey}`,
          accept: "application/json",
          "content-type": "application/json",
          revision: "2023-10-15",
        },
        body: JSON.stringify({
          data: {
            type: "profile",
            attributes: {
              email,
              phone_number: phone || undefined,
              properties: {
                SpinWheel_WonCode: wonCode,
                SpinWheel_WonDiscount: wonDiscountLabel,
                Source: "Convert Spin Wheel",
              },
            },
          },
        }),
      });
      results.klaviyo = response.ok;
    } catch (e) {
      console.error("Klaviyo Sync Error:", e);
      results.klaviyo = false;
    }
  }

  // 2. Mailchimp Sync
  if (shop.mailchimpApiKey && email) {
    try {
      // API Key format: hash-usX where usX is datacenter
      const datacenter = shop.mailchimpApiKey.split("-")[1] || "us1";
      const url = `https://${datacenter}.api.mailchimp.com/3.0/lists`;

      // Fetch list ID first if needed or add tag
      const authHeader = `Basic ${Buffer.from(`anystring:${shop.mailchimpApiKey}`).toString("base64")}`;
      
      const listRes = await fetch(url, {
        headers: { Authorization: authHeader },
      });
      
      if (listRes.ok) {
        const listData = await listRes.json();
        const defaultListId = listData.lists?.[0]?.id;

        if (defaultListId) {
          await fetch(`https://${datacenter}.api.mailchimp.com/3.0/lists/${defaultListId}/members`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email_address: email,
              status: "subscribed",
              merge_fields: {
                WON_CODE: wonCode || "",
                WON_DISC: wonDiscountLabel || "",
              },
            }),
          });
          results.mailchimp = true;
        }
      }
    } catch (e) {
      console.error("Mailchimp Sync Error:", e);
      results.mailchimp = false;
    }
  }

  // 3. SendGrid Contacts Sync
  if (shop.sendgridApiKey && email) {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/marketing/contacts", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${shop.sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contacts: [
            {
              email,
              custom_fields: {
                spin_won_code: wonCode,
              },
            },
          ],
        }),
      });
      results.sendgrid = response.ok;
    } catch (e) {
      console.error("SendGrid Sync Error:", e);
      results.sendgrid = false;
    }
  }

  return results;
}
