# Client phone numbers

Collected at registration for client-profile information and administrative contact only.

**Not used for:** SMS, one-time codes, or phone sign-in. No message is ever sent to the number, and it is never shown as verified.

## Storage

- **Columns:** `profiles.phone` holds the number in E.164 form (`+2348031234567`). `profiles.phone_country` holds the ISO country chosen (`NG`).
- **Format rules:** both columns are nullable and have format checks (migration `202611210001_client_phone.sql`).
- **Existing accounts:** keep `null`. Admins see "Not provided"; the client sees "Not added" with an Add button.
- **Sign-up details:** the auth user's sign-up metadata (`phone_number`, `phone_country`) is read once, by `handle_new_user`, when the profile is created. After that, `profiles` is the only source of truth.

## Validation

`lib/phone.ts` (libphonenumber-js, pinned) applies the same rules in the form and on the server:
- The number must be a possible number for the chosen country.
- A national number with its trunk prefix is normalised: Nigeria `0803 123 4567` becomes `+2348031234567`, while Italy `06 …` keeps its 0.
- Countries that share a calling code (+1, +44, +7) keep the country the person chose.
- The database checks the E.164 format again.

## Who can change it

- **Sign-up:** `POST /api/auth/signup` validates the number, then passes it in the sign-up details. Supabase `signUp` is still called with email and password only, and email confirmation is unchanged.
- **Client:** profile → Phone number → `PATCH /api/client/profile` → `set_my_phone`. It writes only the signed-in user's own row (`auth.uid()`), and no user id is accepted. Clients have no direct UPDATE permission on `profiles`.
- **Admin:** client page → phone → `POST /api/admin/client-phone` → `admin_set_client_phone`. It is admin-only and needs a reason.
- **Audit:** every change is logged as `PHONE_UPDATED`, recording who made it and the before and after values. `admin_update_client` (name and status) never touches the phone.

## Who can see it

- **Clients:** only their own number, because the `profiles` select policy covers their own row only.
- **Admins:** Admin → Clients (Phone column, plus search by phone in any format of 5 or more digits) and the client page header.
