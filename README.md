# Crafty Cottage — Full E-Commerce & Inventory Admin

Handcrafted beaded bags e-commerce storefront and admin portal built with **Next.js 16 (App Router)** and **Firebase** (Firestore, Auth, Storage).

## Routes
- `/` — Public storefront, live Prima Collection inventory, category/search filters, and Custom Bespoke Colour Studio.
- `/checkout` — Cart summary, Ibadan/Lagos/Nationwide delivery calculator, direct bank transfer instructions, and receipt upload.
- `/track` — Customer order status tracker via Order Reference code (`CC-XXXXXX`).
- `/admin` — Protected Admin Portal:
  - **Inventory Manager**: Add/edit/delete products, upload photos, adjust live stock counts, or seed the 4 starter Prima bags.
  - **Orders & Receipts**: Inspect customer transfer screenshots/PDFs, verify payment (auto-deducts stock), and update delivery progress.
  - **Bespoke Requests**: Review custom colour specs submitted by customers and jump straight to WhatsApp.
  - **Bank & Delivery Settings**: Update bank account details and delivery zone fees dynamically.

## Running Locally (Works Out of the Box)
```bash
npm install
npm run dev
```
Without `.env.local` Firebase keys, `npm run dev` runs in **Local Demo Mode** using browser storage so you can test the storefront, order tracking and admin portal. A banner marks every page while demo mode is on. Checkout stays paused until you save bank details in Admin → Bank and delivery.

A **production build without Firebase keys fails on purpose**, so a misconfigured deploy can never tell customers their order was received when it wasn't. To deploy a throwaway demo anyway, set `NEXT_PUBLIC_DEMO_MODE=true`.

## Connecting Live Firebase
1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication** (Email/Password provider), **Cloud Firestore** (Standard edition), and **Cloud Storage**.
3. Copy `.env.example` to `.env.local` and paste your Firebase Web App credentials plus `NEXT_PUBLIC_ADMIN_EMAILS=owner@craftycottage.ng`.
4. Deploy the security rules:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage
   ```
5. Create an admin user in Firebase Auth, then add a document in Firestore at `admins/{uid}` (or set `NEXT_PUBLIC_ADMIN_EMAILS` / custom claim `admin: true`).
6. Sign into `/admin` and click **Load Prima Collection** to populate your initial inventory into Firestore.
