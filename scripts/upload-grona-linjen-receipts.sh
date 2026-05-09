#!/bin/bash
# Upload all Gröna Linjen receipt PDFs to Supabase Storage and update expense records
source /Users/bruskzanganeh/amida/.env.local

BUCKET="expenses"
BASE_URL="$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/$BUCKET"
AUTH="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
DB_CONN="postgresql://$SUPABASE_DB_USER@$SUPABASE_DB_HOST:5432/postgres"
COMPANY="4d8238fb-5de4-4c9f-959a-15e93a3bf5d6"

upload_and_link() {
  local expense_id="$1"
  local file_path="$2"
  local storage_name="$3"

  if [ ! -f "$file_path" ]; then
    echo "SKIP (not found): $file_path"
    return
  fi

  local storage_path="receipts/grona-linjen/$storage_name"

  # Upload
  local result=$(curl -s -X POST "$BASE_URL/$storage_path" \
    -H "$AUTH" \
    -H "Content-Type: application/pdf" \
    --data-binary @"$file_path" 2>&1)

  if echo "$result" | grep -q '"Key"'; then
    # Get public URL
    local public_url="$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/$BUCKET/$storage_path"
    local file_size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null)

    # Update expense
    PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$DB_CONN" -q -c \
      "UPDATE expenses SET attachment_url = '$public_url', file_size = $file_size WHERE id = '$expense_id';"

    echo "OK: $storage_name ($expense_id)"
  else
    echo "ERR: $storage_name - $result"
  fi
}

E2024="/Users/bruskzanganeh/Downloads/Ekonomi 2024 Skickat in allt!"
GL="/Users/bruskzanganeh/Downloads/Gröna Linjen"

echo "=== Uploading 2023 expenses ==="

# 2023-02-24 MTA Förening (Amanda Ginsburg)
upload_and_link "0c85f6b1-78a0-405b-9386-302c502e2f61" "$E2024/Kostnader/2023-02-18 Amanda Ginsburg/2023-02-18 Amanda Ginsburg Faktura_1586.pdf" "2023-02-24-MTA-Forening-1586.pdf"

# 2023-06-03 Willem Stam AB (Sofie) - Glass
upload_and_link "4251eea4-36ba-4f69-bb03-de519e3b8382" "$E2024/Kostnader/2023-05-20 Glass och Tchaikovskij/2023-05-20 Sofie Invoice 013.23.pdf" "2023-06-03-Willem-Stam-013.23.pdf"

# 2023-11-20 Karin Hansson Lasses
upload_and_link "26ef1119-50e2-428e-afce-32b95969b789" "$E2024/Kostnader/2023-11-10 Strauss Brahms/2023-11-20 Karin .pdf" "2023-11-20-Karin-Hansson-2023006.pdf"

# 2023-11-28 Bernt Lysell
upload_and_link "229807bb-78e7-4e1e-b290-be1d3fe0f78f" "$E2024/Kostnader/2023-11-10 Strauss Brahms/2023-11-28 Strauss-Brahms Bernt Lysell.pdf" "2023-11-28-Bernt-Lysell.pdf"

# 2023-12-01 CH Tryckeri (Julkonsert)
upload_and_link "d41b28cf-91e5-4c9d-ae7c-dd20cc6f13ae" "$E2024/Kostnader/2023-12-17 Jul Konsert/2024-01-01 CH tryckeri.pdf" "2023-12-01-CH-Tryckeri-6125.pdf"

# 2023-12-07 Vidar Andersson Meilink
upload_and_link "4cdf3871-00d1-4b26-9e0b-b88424d9397f" "$E2024/Kostnader/2023-11-10 Strauss Brahms/2024-01-06 Strauss-Brahms Faktura 74 Vidar Andersson Meilink.pdf" "2023-12-07-Vidar-74.pdf"

# 2023-12-18 RH Musikproduktion (David Huang)
upload_and_link "30c6bcdc-1fe9-4cfa-92f9-742bd357a896" "$E2024/Kostnader/2023-12-17 Jul Konsert/Faktura 233 RH Musikproduktion AB.pdf" "2023-12-18-RH-Musik-233.pdf"

# 2023-12-20 Anders Kjellberg Nilsson
upload_and_link "f91f2321-9daa-428f-bca9-43671401cf2d" "$E2024/Kostnader/2023-12-17 Jul Konsert/23-18.pdf" "2023-12-20-Anders-Kjellberg-23-18.pdf"

# 2023-12-21 BAGGAB (Carl Bagge)
upload_and_link "5ae34af7-4177-4824-b992-503c1ffb0029" "$E2024/Kostnader/2023-12-17 Jul Konsert/Faktura_864_Grona_Linjen.pdf" "2023-12-21-BAGGAB-864.pdf"

# 2023-12-22 Willem Stam (Sofie) - Julkonsert
upload_and_link "d11aa4dc-a5a2-43f7-bbbb-47d6869bfbee" "$E2024/Kostnader/2023-12-17 Jul Konsert/Invoice 055.23.pdf" "2023-12-22-Willem-Stam-055.23.pdf"

# 2023-12-27 Migdal (Julia Nilsson) - Julkonsert
upload_and_link "bb85a0b5-0cc4-42ee-8931-6099e903996a" "$E2024/Kostnader/2023-12-17 Jul Konsert/231227_Faktura 1185 Gröna Linjen Nilsson.pdf" "2023-12-27-Migdal-1185.pdf"

# 2023-12-29 Cantarel (Amanda Ginsburg) - Julkonsert
upload_and_link "84465675-2471-498a-803f-13614611432e" "$E2024/Kostnader/2023-12-17 Jul Konsert/Faktura_253.pdf" "2023-12-29-Cantarel-253.pdf"

# 2024-02-27 Riikka Repo
upload_and_link "bc84294d-a834-4ae9-b326-ffd994ff6a5e" "$E2024/Kostnader/2023-11-10 Strauss Brahms/2024-02-27 Faktura 1029.pdf" "2024-02-27-Riikka-Repo-1029.pdf"

echo ""
echo "=== Uploading 2024 expenses (from Gröna Linjen/2024/Kostnader/behandlade) ==="

B="$GL/2024/Kostnader/behandlade"

upload_and_link "f0b60179-fa75-48b0-82bb-811c9db923b4" "$E2024/Kostnader/2023-12-17 Jul Konsert/Faktura 2402 GK.pdf" "2024-01-02-GK-Music-2402.pdf"
upload_and_link "1291d53d-f096-4715-98c7-177d6554856b" "$B/2024-01-30 Babalisk Faktura-157.pdf" "2024-01-30-Babalisk-157.pdf" 2>/dev/null
upload_and_link "ac92af63-506a-4b48-be6a-404f73b16cbc" "$B/2024-01-24 _Faktura 1190 Gröna Linjen.pdf" "2024-01-24-Migdal-1190.pdf"
upload_and_link "720d2ba6-b45d-4f26-881d-9f6dda85a3e3" "$B/2024-01-25 Kundfaktura_116.pdf" "2024-01-25-Andreas-116.pdf"
upload_and_link "43e05469-b190-4a33-bd7b-fc89926bda6b" "$E2024/Kostnader/2024.04.01 CH tryckeri 6379.pdf" "2024-03-20-CH-Tryckeri-6379.pdf"
upload_and_link "42a5e0a2-bf96-4aae-a611-807c52b288cd" "$B/2024-06-20 Faktura109.pdf" "2024-06-20-Albin-109.pdf"
upload_and_link "8751123b-2b72-4a33-96ec-9713eda90f19" "$E2024/Kostnader/2024 -04-14 Schubert/2024-05-21 Damon Faktura_539.pdf" "2024-05-06-Damon-539.pdf"
upload_and_link "33c127da-8854-4ee4-9bf5-66d1c9a0d465" "$E2024/Kostnader/2024-05-11 ENESCU/2024-05-21 Årsta Faktura_10603.pdf" "2024-05-08-Arsta-10603.pdf"
upload_and_link "44095051-9e25-4124-a208-53270504cae8" "$E2024/Kostnader/2024 -04-14 Schubert/2024-05-21 Årsta Faktura_10596.pdf" "2024-05-17-Arsta-10596.pdf"
upload_and_link "33767e9a-8d91-42f9-b13d-ebe1377796c9" "$E2024/Kostnader/2024-05-11 ENESCU/2024-05-21 Patrik S Faktura.pdf" "2024-05-21-Patrik-125.pdf"
upload_and_link "42a5e0a2-bf96-4aae-a611-807c52b288cd" "$E2024/Kostnader/2024 -04-14 Schubert/2024-05-21 Faktura305 Fabian.pdf" "2024-05-02-Fabian-305.pdf"
upload_and_link "393d4609-bc09-404c-ad52-d234f84eb0a9" "$B/2024-06-14 danial-shariati-faktura-30.pdf" "2024-06-14-Danial-30.pdf"
upload_and_link "066db211-3141-4a7b-a1ab-bdec0c304f2b" "$B/2024-06-12 Andreas Lavotha AB Faktura_141.pdf" "2024-06-12-Andreas-141.pdf" 2>/dev/null
upload_and_link "803b0802-268d-4979-a5ad-cb00b753ecc6" "$B/2024-06-29 _Faktura 1216 Migdal Gröna Linjen.pdf" "2024-06-29-Migdal-1216.pdf"
upload_and_link "0a7ab704-ccec-4dd4-a19b-9531ece4df7c" "$B/2024-07-01 Babalisk Faktura-167.pdf" "2024-07-01-Babalisk-167.pdf"
upload_and_link "8f72ab06-0eb3-4a61-abe1-560510484c3c" "$B/2024-08-15 CH tryckeri 6632.pdf" "2024-08-05-CH-6632.pdf"
upload_and_link "9551ea03-3b13-46d0-9474-f69f5ceb4b03" "$B/2024-08-14 Faktura_10658.pdf" "2024-08-14-Arsta-10658.pdf"
upload_and_link "0ea09723-6891-40e9-bbb2-09b979201f35" "$B/2024-09-14 Lynstudio 202425.pdf" "2024-08-18-LynStudio-202425.pdf"
upload_and_link "04d349b6-4e5b-488d-bd69-90b3700bc730" "$B/2024-09-14 Alva 8297188.pdf" "2024-08-22-AlvaPress-8297188.pdf"
upload_and_link "98829351-fd7f-4b73-8533-66c4f5cf6f87" "$B/2024-09-14 Niklas Faktura24-068grönalinjenfernqvist.pdf" "2024-09-02-Niklas-24-068.pdf"
upload_and_link "7eba5d40-f21d-4ccf-a235-5914e3c3c361" "$B/2024-09-14 GL Faktura-2033021.pdf" "2024-09-08-GL-Vasastan-2033021.pdf"
upload_and_link "40de9e0d-096a-4b7d-8e6b-eeff438ba0e0" "$B/2024-09-17 Andreas Kundfaktura_150.pdf" "2024-09-17-Andreas-150.pdf"
upload_and_link "183c790c-b875-4c9b-a60f-ce84f6c1e150" "$B/2024-09-27 Faktura-174.pdf" "2024-09-28-Babalisk-174.pdf"
upload_and_link "1fa186b1-e800-45bb-814d-97d0cb0c94b4" "$B/2024-09-29 Emelie Blank 44.pdf" "2024-09-29-Emilie-114.pdf"
upload_and_link "c200723c-c91f-455b-9cf5-472a76a90a78" "$B/2024-12-08 CH 6793.pdf" "2024-10-22-CH-6793.pdf"
upload_and_link "47aabadb-68b0-404c-89f7-09bc76dd36ec" "$B/2024-11-04 Årsta Faktura_10716.pdf" "2024-11-04-Arsta-10716.pdf"
upload_and_link "f136e4a4-0250-46d2-9b61-a785b573cf82" "$B/2024-11-04 Årsta Faktura_10716.pdf" "2024-11-04-NilsErik-703.pdf" 2>/dev/null
upload_and_link "9e7b3f15-950e-447a-8fab-aa903804832d" "$B/2024-11-14 Willem 029.24.pdf" "2024-11-05-Willem-024.24.pdf"
upload_and_link "39272130-a1cd-4ad6-9dfb-36842e66be1a" "$B/2024-11-06 Transport Faktura_13505.pdf" "2024-11-06-QRIR-13505.pdf"
upload_and_link "ff25ff1a-515a-4e44-946f-59b142b96820" "$B/2024-11-08 Jonna Faktura 2024110842.pdf" "2024-11-08-Jonna-2024110842.pdf"
upload_and_link "e72bcfde-3c54-489e-8f2b-8755345af0c6" "$B/2024-11-10 Björn Cembalo.pdf" "2024-11-10-Bjorn-870.pdf"
upload_and_link "70ded324-1fac-419c-a17a-0d576f04ab48" "$B/2024-11-14 Willem 029.24.pdf" "2024-11-14-Willem-029.24.pdf"
upload_and_link "7f9b46a7-80b7-429e-8f54-dd915622f4b0" "$B/2024-11-19 Babalisk Faktura-175.pdf" "2024-11-19-Babalisk-175.pdf"
upload_and_link "d83b90a1-2104-4a21-99d6-068b958a8cd1" "$B/2024-11-29 Årsta Faktura_10751.pdf" "2024-11-29-Arsta-10751.pdf"
upload_and_link "bab0de79-209a-4878-b448-9eddd39b120d" "$B/2024-12-09 CH6891.pdf" "2024-12-03-CH-6891.pdf"
upload_and_link "d5d73c94-e3d9-48d9-ac55-f87d1b9425ea" "$B/2024-11-19 Nisse  Vivaldi.pdf" "2024-08-26-MTA-1740.pdf" 2>/dev/null

echo ""
echo "=== Uploading 2025 expenses (from Gröna Linjen/2025/kostnader) ==="

K25="$GL/2025/kostnader"

upload_and_link "189ed0a0-256b-4d8d-ad9c-7c6bb8258531" "$K25/2025-02-02 Alva Holm invoice_S13093-6436.pdf" "2025-01-09-Alva-Holm-S13093.pdf"
upload_and_link "81ce704a-9fbe-4eff-adcd-d9c792c4f092" "$K25/2025-02-02 Faktura_1941           2440.pdf" "2024-12-17-Damon-1941.pdf"
upload_and_link "12d5b8ea-c16d-4050-84a7-efce3edf7dc1" "$K25/2025-02-02 Folkets Hus.pdf" "2025-02-02-Arsta-10849.pdf" 2>/dev/null
upload_and_link "b1660ffd-2405-452e-8382-ad46c11e2378" "$K25/2025-02-13 Tryckeri 7092.pdf" "2025-02-13-CH-7092.pdf"
upload_and_link "d345e514-1ea6-4635-b88a-846013fc85eb" "$K25/2025-03-17 Faktura 1058.pdf" "2025-03-17-Riikka-1058.pdf"
upload_and_link "1c4cb601-41af-490b-bd9f-d6d97bbe425f" "$K25/2025-03-17 Grönalinjen25.pdf" "2025-03-17-Erik-Wahlgren.pdf"
upload_and_link "b326769c-01d3-48a4-b696-01c3dbbe5520" "$K25/2025-03-19 Faktura_10909.pdf" "2025-03-19-Arsta-10909.pdf"
upload_and_link "f0312792-b8b4-4ef5-8c34-3a697d8cea8d" "$K25/2025-03-19 Willem 008.25.pdf" "2025-03-19-Willem-008.25.pdf"
upload_and_link "3cc17dd0-9643-4aba-92a0-7b5be3db160e" "$K25/2025-04-24 andreas Kundfaktura_179.pdf" "2025-03-25-Andreas-179.pdf"
upload_and_link "44bd824c-73fc-4dc7-9ffc-b6bc2ad1af04" "$K25/2025-03-28_Faktura 1240 Gröna Linjen Migdal.pdf" "2025-03-28-Migdal-1240.pdf"
upload_and_link "a3eb41be-acb9-4b4f-bd0d-771540bcc789" "$K25/2025-04-15 Årsta Faktura_10966.pdf" "2025-04-15-Arsta-10966.pdf"
upload_and_link "937f59cd-843f-401e-9c74-4f69da3a29a3" "$K25/2025-05-28 Kundfaktura_191.pdf" "2025-04-28-Andreas-191.pdf"
upload_and_link "6dd9df04-3ca2-4e6f-875b-0fe7593d67f3" "$K25/2025-05-12 faktura 202518.pdf" "2025-04-30-Daniel-202518.pdf"
upload_and_link "67373de3-d8f8-4f3b-9979-cf6f3eec6011" "$K25/2025-05-12 25122.pdf" "2025-05-04-Carl-25122.pdf"
upload_and_link "d340ee6d-8d2f-4899-b937-b7f85b17a143" "$K25/2025-05-10 ch 7235.pdf" "2025-05-10-CH-7235.pdf"
upload_and_link "02823aab-f4da-418a-81e6-6968609d01c0" "$K25/2025-05-21 Babalisk Faktura-204.pdf" "2025-05-11-Babalisk-204.pdf"
upload_and_link "74075a8f-11a8-4c1b-aa4c-5f1418e0ba3a" "$K25/2025-09-04 Faktura-2034959.pdf" "2025-06-09-GL-Vasastan-2034959.pdf"
upload_and_link "e9aee0e5-3fcc-479c-b134-63dc7bc65afb" "$K25/2025-09-05 F27387.pdf" "2025-07-30-LaserTryck-F27387.pdf"
upload_and_link "38179a34-519a-41bd-a92f-0eff24039119" "$K25/2025-09-05 årsta Faktura_11032.pdf" "2025-08-22-Arsta-11032.pdf"
upload_and_link "2e246424-14b2-41be-b821-d3144d794ae6" "$K25/2025-09-05 Faktura 2502.pdf" "2025-08-31-Kaufeldt-2502.pdf"
upload_and_link "3bdfd810-ec65-4625-934c-69db2408b6ce" "$K25/2025-09-05 alva 006.25 Gröna Linjen 15.08.25.pdf" "2025-09-02-Alva-006.25.pdf"
upload_and_link "db6f64b0-c3a2-413e-91c3-783204da2442" "$K25/2025-10-27 Faktura 2507.pdf" "2025-10-27-Kaufeldt-2507.pdf"
upload_and_link "a558b24b-a74e-4c65-bb2c-c8c259c01776" "$K25/2025-10-29 Faktura_4044.pdf" "2025-10-29-Damon-4044.pdf"
upload_and_link "65959962-12c2-49dd-a489-e700d09edb0e" "$K25/2025-11-06 Faktura_11145.pdf" "2025-11-06-Arsta-11145.pdf"
upload_and_link "1bffdf15-4e30-48d0-ad3a-45f65c7dd93f" "$K25/2025-11-07 Kundfaktura_214.pdf" "2025-11-07-Andreas-214.pdf"
upload_and_link "53397289-7a2e-4cd4-9006-344a79971915" "$K25/2025-11-11 Faktura-228.pdf" "2025-11-11-Babalisk-228.pdf"
upload_and_link "f3381ff4-a4ef-4e5e-b783-6fdfd4d64cf2" "$K25/2025-12-27 Faktura_Yongmin_Lee_ny_faktura_utan_moms.pdf" "2025-11-11-Yongmin-Lee.pdf"
upload_and_link "c17b9a6b-84bd-4e5d-a2c8-42a32cee3fa2" "$K25/2025-12-06 7623.pdf" "2025-11-27-CH-7623.pdf"
upload_and_link "87cc09ac-ecb6-4f0c-a81c-d78d55f85141" "$K25/2025-12-22 2309a04b-4e5c-4bd2-be9f-664b9655e901.pdf" "2025-12-22-CH-7863.pdf"
upload_and_link "e4043563-7829-40c5-9d5b-1496fa402dbc" "$K25/2025-12-22 8527118.pdf" "2025-12-22-FrilansFinans-8527118.pdf"

echo ""
echo "=== Uploading Billetto receipts (invoices) ==="

# Billetto receipts - upload to company-documents bucket and link to invoice original_pdf_url
INV_BUCKET="company-documents"
INV_BASE="$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/$INV_BUCKET"

upload_invoice() {
  local invoice_id="$1"
  local file_path="$2"
  local storage_name="$3"

  if [ ! -f "$file_path" ]; then
    echo "SKIP (not found): $file_path"
    return
  fi

  local storage_path="ba9c0cd4-86b0-4c8b-87bc-823ef2063be3/invoices/$storage_name"

  curl -s -X POST "$INV_BASE/$storage_path" \
    -H "$AUTH" \
    -H "Content-Type: application/pdf" \
    --data-binary @"$file_path" > /dev/null 2>&1

  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$DB_CONN" -q -c \
    "UPDATE invoices SET original_pdf_url = '$storage_path' WHERE id = '$invoice_id';"

  echo "OK: $storage_name"
}

BI="$E2024/Kundfakturor : Intäkter"
BI2="$GL/2024/intäkte"
BI3="$GL/2025/intäkter"

# 2023 Billetto
upload_invoice "b0000001-0000-0000-0000-000000000001" "$BI/2023-01-20 Billetto payment receipt - Event 763620.pdf" "billetto-763620.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000002" "$BI/2023-02-18 Billetto payment receipt - Event 762085.pdf" "billetto-762085.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000003" "$BI/2023-05-20 Tchaikovsky Glass Billetto payment receipt - Event 829126.pdf" "billetto-829126.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000004" "$BI/2023-11-16 Billetto payment receipt - Event 881421.pdf" "billetto-881421.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000005" "$BI/2023-12-17 Billetto payment receipt - Event 893221.pdf" "billetto-893221.pdf"

# 2024 Billetto
upload_invoice "b0000001-0000-0000-0000-000000000006" "$BI2/2024-04-17 Billetto payment receipt - Event 957603.pdf" "billetto-957603.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000007" "$BI2/2024-05-11 Billetto payment receipt - Event 957608.pdf" "billetto-957608.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000008" "$BI2/2024-08-19 Billetto payment receipt - Event 994303.pdf" "billetto-994303.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000009" "$BI2/2024-11-04 Billetto payment receipt - Event 1098520.pdf" "billetto-1098520.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000010" "$BI2/2024-12-05 Billeto Billetto payment receipt - Event 1103869.pdf" "billetto-1103869.pdf"

# 2025 Billetto
upload_invoice "b0000001-0000-0000-0000-000000000011" "$BI3/2025-03-02 Billetto payment receipt - Event 1166712.pdf" "billetto-1166712.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000012" "$BI3/2025-05-01 Billetto payment receipt - Event 1138374.pdf" "billetto-1138374.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000013" "$BI3/2025-09-05 Billetto payment receipt - Event 1331658.pdf" "billetto-1331658.pdf"
upload_invoice "b0000001-0000-0000-0000-000000000014" "$BI3/2025-10-25 Billetto payment receipt - Event 1331659.pdf" "billetto-1331659.pdf"

# Bidrag
upload_invoice "b0000001-0000-0000-0000-000000000015" "$BI3/2024-06-13 bidrag.pdf" "bidrag-enescu.pdf"

echo ""
echo "=== DONE ==="

# Count results
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$DB_CONN" -c "
SELECT
  'Expenses with attachments' as type,
  COUNT(*) FILTER (WHERE attachment_url IS NOT NULL) as count,
  COUNT(*) as total
FROM expenses WHERE company_id = '$COMPANY';"
