# Gennext Cheque Collection: setup guide

This guide sets up the cheque collection app for the DT and EU departments. It takes about 30 minutes, and everything is done in a web browser. You never need a terminal.

You will create three accounts, all under the company email:

- **Supabase** holds the database, the logins and the cheque photos.
- **GitHub** keeps the app's files.
- **Vercel** puts the app on the internet, at an address such as `gennext-cheques.vercel.app`.

## What is in this folder

| Folder or file | What it is |
|---|---|
| `supabase/001_tables.sql` to `007_overview_admin.sql` | The database. Run these in order, once each. Every file is safe to run again. |
| `supabase/make_me_admin.sql` | Makes you the first Finance Admin. Run it once. |
| `src/`, `public/`, `index.html`, `package.json`, `vite.config.js`, `vercel.json` | The app itself. |
| `.env.example` | Shows the two settings Vercel needs. |

---

## Step 1: Create the Supabase project

1. Go to **supabase.com** and sign in with the company email. You can also sign in with the company GitHub account.
2. Click **New project**.
3. Fill in the form:
   - **Name:** `gennext-cheques`.
   - **Database password:** click **Generate**, then save the password somewhere safe. The app doesn't need it, but Supabase support may ask for it.
   - **Region:** **South Asia (Mumbai)**, or **Southeast Asia (Singapore)** if Mumbai isn't offered.
4. Click **Create new project** and wait about two minutes for it to finish.

## Step 2: Run the database files

1. In the left menu, open **SQL Editor**.
2. Click **New query**.
3. Open `supabase/001_tables.sql` in Notepad or TextEdit. Copy all of it, paste it into the editor, and click **Run**. You should see *Success. No rows returned*.
4. Do the same for `002_security.sql`, `003_people_imports.sql`, `004_collections.sql`, `005_bank_deposits.sql`, `006_bc_export.sql` and `007_overview_admin.sql`, in that order. Use a new query each time, or clear the editor before pasting.

If a file shows an error, copy the red message and send it to me. It's safe to run a file again after a fix.

## Step 3: Create your login and make yourself Finance Admin

1. In the left menu, open **Authentication**, then **Users**.
2. Click **Add user**, then **Create new user**.
3. Type your work email and a password. Tick **Auto Confirm User**, then click **Create user**.
4. Go back to **SQL Editor** and open a **New query**.
5. Paste in the contents of `supabase/make_me_admin.sql`. On the line marked `<<<`, change `your.name@gennext.lk` to your email.
6. Click **Run**. The result should show your email with `is_admin` set to `true`.

## Step 4: Copy the two keys the app needs

1. Click **Connect** at the top of the Supabase project page.
2. Copy the **Project URL**, which looks like `https://abcdefgh.supabase.co`. Keep it in a note.
3. Copy the **publishable key**, which starts with `sb_publishable_`. If you only see older keys, copy the **anon public** key instead. You can also find these keys under **Project Settings**, then **API Keys**.

> Never copy the **secret** or **service_role** key anywhere. The app doesn't use it.

## Step 5: Put the files on GitHub

1. Go to **github.com** and sign in with the company account.
2. Click **+** at the top right, then **New repository**.
3. Name the repository `gennext-cheques`, choose **Private**, and click **Create repository**.
4. On the new repository page, click the link **uploading an existing file**.
5. Unzip `gennext-cheques.zip` on your computer.
6. Open the unzipped `gennext-cheques` folder. Select **everything inside it** (the `src`, `public` and `supabase` folders and all the files) and drag it onto the GitHub page. Drag the contents, not the outer folder itself.
7. Wait for every file to finish loading, then click **Commit changes**.

## Step 6: Publish the app on Vercel

1. Go to **vercel.com**. Click **Sign Up**, choose **Continue with GitHub**, and use the company GitHub account.
2. Click **Add New…**, then **Project**.
3. Find `gennext-cheques` in the list and click **Import**. If it isn't listed, click **Adjust GitHub App Permissions** and allow access to the repository.
4. Vercel detects **Vite** on its own, so leave the build settings as they are.
5. Open **Environment Variables** and add these two:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | the Project URL from step 4 |
   | `VITE_SUPABASE_ANON_KEY` | the publishable (or anon) key from step 4 |

6. Click **Deploy**. After about a minute, Vercel shows the app's address. Open it.

If the page says **Almost ready**, the two variables are missing or misspelled. In Vercel, open **Settings**, then **Environment Variables**, and fix them. Then open **Deployments**, click the **⋯** menu on the latest deployment, and choose **Redeploy**.

## Step 7: Let sign-in emails open the app

1. In Supabase, open **Authentication**, then **URL Configuration**.
2. Set **Site URL** to the Vercel address, for example `https://gennext-cheques.vercel.app`.
3. Under **Redirect URLs**, click **Add URL** and enter the same address followed by `/**`, for example `https://gennext-cheques.vercel.app/**`. Then click **Save**.

Without this step, "Email me a sign-in link" and "Forgot your password?" emails would send people to the wrong address.

## Step 8: First things to do in the app

Sign in with the login you made in step 3, then work through these pages.

1. **Customer data**
   - In BC, open **Customers** and choose **Open in Excel**. Upload that file here and click **Save**.
   - In BC, open **Customer Ledger Entries** with the **Bu Code** column showing. Export **all** entries, not only the open ones, because the app uses the payments to see what BC has posted. Upload the file. The preview shows open entries per department and lists any entries with no Bu Code. Click **Save**.
2. **Bank**
   - Click **Add from BC file** and upload your BC Bank Accounts export.
   - Tick only the accounts you deposit cheques into, for example `SAMPATH-C/A-7548` or `NDB-C/A-5729`.
3. **Settings**
   - Type the journal **Batch Name** the receipts should go into, and check the description patterns.
   - Under document numbers, leave **Next number** blank. You will type the first free REC-N number at your first export.
4. **People**
   - Click **Add a person** for each colleague and set their email, role and, for sales, their department (DT, EU or both).
   - Each person then creates their own login on the sign-in page with **Create your login**, using that same email. You can also add them yourself under Supabase **Authentication**, then **Users**. Their access applies as soon as the login exists.

> Supabase's built-in email sends only a few messages an hour. For more, add your own mail server under **Authentication**, then **Emails**, then **SMTP Settings**. Until then, adding people under **Authentication**, then **Users**, with **Auto Confirm User** ticked avoids emails altogether.

**One thing to try:** raise a test request yourself (**+ New request**), assign it to a driver, and record a collection on the driver's behalf. Then check the request on the Collections list.

---

## How a cheque moves through the app

| Status | Who acts next | What they do |
|---|---|---|
| **With finance** | Finance | Assigns a driver and a date |
| **To collect** | Driver | Records the cheque(s) with a photo, or reports "Couldn't collect" |
| **With driver** | Finance | Checks the paper cheques and clicks "Checked, the cheques are with me". If there are several cheques for several invoices, sales first says which invoice each cheque pays. |
| **To deposit** | Finance | Puts the cheques on a deposit slip (Deposits) |
| **In bank?** | Finance | Uploads the bank statement (Bank) and matches the slip, which closes the collection |
| **Closed** | Finance | Exports the receipts to BC (Export to BC), posts them in BC, then uploads the BC entries (BC check) |
| **Returned** | Sales | Raises a replacement request |

## Rules the app enforces

- A request belongs to **one department**, and every invoice on it must have that department's Bu Code. The department never changes after the request is raised.
- Sales see every collection of their department(s), but they can change only their own requests. Drivers see only their own jobs. Management can see everything but change nothing.
- An invoice that is already on another live request shows only its remaining balance.
- Uploading the ledger or a bank statement again never changes a collection or a matched bank line.
- **Export to BC** creates one receipt document per bank statement line, numbered from your REC-N series, with the department's Bu Code on every line. Exporting the same line again keeps its number.

## Updating the app later

- **Database changes** come as new numbered files (`008_…sql` and so on). Run each one in the SQL Editor, in order.
- **App changes** come as changed files. In GitHub, open the folder, click **Add file**, then **Upload files**, drop the changed files in, and click **Commit changes**. Vercel publishes the new version on its own within a minute or two.

## Installing on phones

- **Android (Chrome):** open the app address, then open the browser menu and choose **Install app**.
- **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.
