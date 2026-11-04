#!/usr/bin/env bash
# Usage: ACTIVATION_TOKEN=... ./smoke-test.sh   (API must be running on :4000, DB freshly migrated)
B=http://localhost:4000/api; J=/tmp/jar.txt; rm -f $J
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }
code(){ curl -s -o /tmp/body.json -w '%{http_code}' "$@"; }
PW='Sup3rSecret99'

chk "health" "$(code $B/health)" 200
chk "me without token -> 401" "$(code $B/auth/me)" 401
chk "login before activation -> 401" "$(code -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"admin@example.com\",\"password\":\"$PW\"}")" 401
chk "weak password rejected" "$(code -X POST $B/auth/activate -H 'Content-Type: application/json' -d "{\"token\":\"$ACTIVATION_TOKEN\",\"password\":\"short\"}")" 400
chk "activate" "$(code -X POST $B/auth/activate -H 'Content-Type: application/json' -d "{\"token\":\"$ACTIVATION_TOKEN\",\"password\":\"$PW\"}")" 200
chk "activation token single-use" "$(code -X POST $B/auth/activate -H 'Content-Type: application/json' -d "{\"token\":\"$ACTIVATION_TOKEN\",\"password\":\"$PW\"}")" 400
chk "wrong password -> 401" "$(code -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"nopenopenope1"}')" 401
chk "login" "$(code -c $J -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"ADMIN@example.com\",\"password\":\"$PW\"}")" 200
AT=$(python3 -c "import json;print(json.load(open('/tmp/body.json'))['data']['accessToken'])")
chk "me with token" "$(code $B/auth/me -H "Authorization: Bearer $AT")" 200
chk "admin lists users" "$(code $B/users -H "Authorization: Bearer $AT")" 200

# create a teacher + parent; teacher must not reach admin endpoints
chk "admin creates teacher" "$(code -X POST $B/users -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"email":"t@example.com","role":"teacher","firstName":"Tee","lastName":"Cher"}')" 201
TT=$(python3 -c "import json;print(json.load(open('/tmp/body.json'))['data']['activationLink'].split('token=')[1])")
chk "duplicate email -> 409" "$(code -X POST $B/users -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"email":"t@example.com","role":"teacher","firstName":"X","lastName":"Y"}')" 409
code -X POST $B/auth/activate -H 'Content-Type: application/json' -d "{\"token\":\"$TT\",\"password\":\"$PW\"}" >/dev/null
code -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"t@example.com\",\"password\":\"$PW\"}" >/dev/null
TA=$(python3 -c "import json;print(json.load(open('/tmp/body.json'))['data']['accessToken'])")
chk "teacher blocked from /users -> 403" "$(code $B/users -H "Authorization: Bearer $TA")" 403

# refresh rotation + reuse detection
cp $J /tmp/jar_old.txt
chk "refresh rotates" "$(code -b $J -c $J -X POST $B/auth/refresh)" 200
sleep 11
chk "old refresh token reuse -> 401" "$(code -b /tmp/jar_old.txt -X POST $B/auth/refresh)" 401
chk "reuse kills the whole family" "$(code -b $J -X POST $B/auth/refresh)" 401
chk "foreign origin refresh -> 403" "$(code -X POST $B/auth/refresh -H 'Origin: https://evil.example')" 403

# suspend takes effect immediately
TID=$(curl -s $B/users?role=teacher -H "Authorization: Bearer $AT" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['items'][0]['id'])")
chk "admin suspends teacher" "$(code -X PATCH $B/users/$TID/status -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"suspended"}')" 200
chk "suspended token rejected" "$(code $B/auth/me -H "Authorization: Bearer $TA")" 401
chk "suspended login -> 403" "$(code -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"t@example.com\",\"password\":\"$PW\"}")" 403

# password reset
code -X POST $B/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"admin@example.com"}' >/dev/null
chk "forgot-password unknown email same 200" "$(code -X POST $B/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"nobody@example.com"}')" 200
echo; echo "passed=$pass failed=$fail"; [ $fail -eq 0 ]
