import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const meta = () => [
  { title: "ConvertSpin: Spin Wheel Popup for Shopify" },
  {
    name: "description",
    content: "Spin-to-win popup for Shopify that captures emails and gives every winner a unique discount code.",
  },
];

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>ConvertSpin: Spin Wheel Popup for Shopify</h1>
        <p className={styles.text}>
          Turn store visitors into subscribers with a spin-to-win popup. Visitors enter their email for a chance
          to win a discount, and every winner gets a unique Shopify discount code.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Your wheel, your prizes</strong>. Set the prizes, colors and win odds, and choose when the
            wheel appears: on exit intent, after scrolling, after a time delay or above a minimum cart value.
          </li>
          <li>
            <strong>Real discount codes</strong>. Each winner receives a unique Shopify discount code, so offers
            can't be shared or reused.
          </li>
          <li>
            <strong>Leads where you need them</strong>. Capture emails and optional phone numbers, export them as
            CSV, or sync them to Klaviyo, Mailchimp or SendGrid.
          </li>
        </ul>
        <p className={styles.text}>
          Free for up to 1,000 impressions per 30 days. <a href="/pricing">See all plans and pricing</a>.
        </p>
      </div>
    </div>
  );
}
