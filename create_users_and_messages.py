import os
import argparse
import json
import random
import string
import time
from typing import List, Dict, Optional, Any
import requests

# --- Constants ---
DEFAULT_API_BASE_URL = "http://127.0.0.1:8080/auth/api"
PASSWORD_LENGTH = 12
ADMIN_USERNAME_ENV = "AUTH_ADMIN_USERNAME"
ADMIN_PASSWORD_ENV = "AUTH_ADMIN_PASSWORD"

# --- Helper Functions ---


def generate_password(length: int = PASSWORD_LENGTH) -> str:
    """Generates a random password with letters, digits, and symbols."""
    characters = string.ascii_letters + string.digits + string.punctuation
    password = ''.join(random.choice(characters) for _ in range(length))
    # Basic complexity check
    if not any(c.islower() for c in password):
        password += random.choice(string.ascii_lowercase)
    if not any(c.isupper() for c in password):
        password += random.choice(string.ascii_uppercase)
    if not any(c.isdigit() for c in password):
        password += random.choice(string.digits)
    if len(password) > length:  # Trim if complexity checks made it longer
        password = password[:length]
    # Ensure it's at least length if complexity checks made it shorter (unlikely with current logic but good practice)
    while len(password) < length:
        password += random.choice(characters)
    return password[:length]


def load_users_from_file(filepath: str, generate_passwords_for_file_users: bool) -> List[Dict[str, str]]:
    """Loads user data from a JSON file."""
    users = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if not isinstance(data, list):
                raise ValueError("User file must contain a JSON list.")

            for item in data:
                if not isinstance(item, dict) or 'username' not in item:
                    print(f"Skipping invalid item in user file: {item}")
                    continue
                username = item['username']
                password = item.get('password')
                if not password or generate_passwords_for_file_users:
                    password = generate_password()
                users.append({'username': username, 'password': password})
        print(f"Loaded {len(users)} users from {filepath}.")
    except FileNotFoundError:
        print(f"Error: User file not found at {filepath}")
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {filepath}")
    except Exception as e:
        print(f"Error loading user file: {e}")
    return users


def generate_formatted_users(num_to_generate: int, username_format: str) -> List[Dict[str, str]]:
    """Generates a list of users with a specific username format."""
    users = []
    print(
        f"Generating {num_to_generate} users with format '{username_format}'...")
    for i in range(num_to_generate):
        # Replace {id} or \d. Using {id} as a common placeholder.
        # User mentioned \d, but {id} is more standard for str.format or f-strings.
        # We'll use .replace() for simplicity here to match the {id} placeholder.
        username = username_format.replace("{id}", str(i + 1))  # 1-based ID
        password = generate_password()
        users.append({'username': username, 'password': password})
    print(f"Generated {len(users)} formatted users.")
    return users

# --- API Interaction Functions ---


def create_user(api_url: str, username: str, password: str, admin_token: str) -> bool:
    """Attempts to create a user via the API using an admin token."""
    register_url = f"{api_url}/user"
    payload = {'username': username, 'password': password}
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    try:
        response = requests.post(
            register_url, headers=headers, json=payload, timeout=10)
        if response.status_code == 201:
            print(f"Successfully created user: {username}")
            return True
        elif response.status_code == 409:  # Conflict - user likely already exists
            print(
                f"User {username} likely already exists (status {response.status_code}). Treating as success for script.")
            return True
        elif response.status_code == 401 or response.status_code == 403:
            print(
                f"Failed to create user {username}. Admin token invalid or insufficient permissions. Status: {response.status_code}")
            return False
        else:
            print(
                f"Failed to create user {username}. Status: {response.status_code}, Response: {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"Error creating user {username}: {e}")
        return False


def login_user(api_url: str, username: str, password: str) -> Optional[str]:
    """Attempts to log in a user and returns the auth token."""
    login_url = f"{api_url}/login"
    payload = {'username': username, 'password': password}
    try:
        response = requests.post(login_url, json=payload, timeout=10)
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                print(f"Successfully logged in user: {username}")
                return token
            else:
                print(
                    f"Login successful for {username} but no token found in response.")
                return None
        else:
            print(
                f"Failed to log in user {username}. Status: {response.status_code}, Response: {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error logging in user {username}: {e}")
        return None

# --- Main Workflow Functions ---


def parse_arguments() -> argparse.Namespace:
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="User Creation and Login Test Script")
    parser.add_argument("--api-url", default=DEFAULT_API_BASE_URL,
                        help="Base URL for the Auth API")
    parser.add_argument("--user-file", type=str,
                        help="Path to JSON file containing user credentials ([{'username': 'u', 'password': 'p'}, ...])")
    parser.add_argument("--generate-passwords", action="store_true",
                        help="Generate new passwords for users from --user-file, ignoring any passwords in the file.")
    parser.add_argument("--num-generated-users", type=int, default=0,
                        help="Number of additional users to generate with the specified format.")
    parser.add_argument("--generated-username-format", type=str,
                        default="gen_user_{id}", help="Format for generated usernames, e.g., 'user_{id}'. '{id}' will be replaced by a serial number (1-based).")
    parser.add_argument("--create-users-only", action="store_true",
                        help="If set, the script will only create users and attempt to log them in, then terminate.")
    return parser.parse_args()


def perform_admin_login(api_url: str) -> Optional[str]:
    """Logs in the admin user using environment variables."""
    print("\n--- Admin Login ---")
    admin_username = os.environ.get(ADMIN_USERNAME_ENV)
    admin_password = os.environ.get(ADMIN_PASSWORD_ENV)

    if not admin_username or not admin_password:
        print("Error: Admin credentials not found in environment variables.")
        print(f"Please set {ADMIN_USERNAME_ENV} and {ADMIN_PASSWORD_ENV}.")
        return None

    admin_token = login_user(api_url, admin_username, admin_password)
    if not admin_token:
        print("Admin login failed. Cannot proceed with user creation.")
        return None
    print("Admin login successful.")
    return admin_token


def prepare_user_list(args: argparse.Namespace) -> List[Dict[str, str]]:
    """Loads users from file and/or generates them based on arguments."""
    print("\n--- Preparing User List ---")
    all_users_to_process: List[Dict[str, str]] = []
    # Using a set to keep track of usernames to ensure uniqueness
    processed_usernames = set()

    # 1. Load users from file
    if args.user_file:
        file_users = load_users_from_file(
            args.user_file, args.generate_passwords)
        for user in file_users:
            if user['username'] not in processed_usernames:
                all_users_to_process.append(user)
                processed_usernames.add(user['username'])
            else:
                print(
                    f"Skipping user '{user['username']}' from file as this username is already processed.")
        print(f"Added {len(all_users_to_process)} unique users from file.")

    # 2. Generate users with specific format
    if args.num_generated_users > 0:
        if not args.generated_username_format:
            print("Warning: --num-generated-users specified but --generated-username-format is missing or empty. No formatted users will be generated.")
        else:
            formatted_users = generate_formatted_users(
                args.num_generated_users, args.generated_username_format)
            for user in formatted_users:
                if user['username'] not in processed_usernames:
                    all_users_to_process.append(user)
                    processed_usernames.add(user['username'])
                else:
                    print(
                        f"Skipping generated user '{user['username']}' as this username is already processed (e.g., from file or duplicate format result).")
            print(
                f"Added {len(formatted_users) - (len(processed_usernames) - len(all_users_to_process))} unique generated formatted users.")

    if not all_users_to_process:
        print("No users specified or generated to process.")
    else:
        print(
            f"Total unique users prepared for processing: {len(all_users_to_process)}")
    return all_users_to_process


def process_users_creation_and_login(
    users_to_process: List[Dict[str, str]],
    api_url: str,
    admin_token: str
) -> Dict[str, Dict[str, Any]]:
    """Creates users (if they don't exist) and attempts to log them in."""
    print("\n--- Processing Users (Create & Login Confirmation) ---")
    # username -> {'token': str or None if login failed}
    processed_user_details: Dict[str, Dict[str, Any]] = {}

    for user_data in users_to_process:
        username = user_data['username']
        password = user_data['password']

        print(f"Processing user: {username}")

        # Attempt to create the user (handles 'already exists' as success)
        creation_successful = create_user(
            api_url, username, password, admin_token)

        if creation_successful:
            # If creation (or existence check) was successful, attempt to log in
            print(f"Attempting login for {username} to confirm credentials...")
            token = login_user(api_url, username, password)
            if token:
                processed_user_details[username] = {
                    'token': token, 'status': 'Login OK'}
                print(
                    f"User {username} created/verified and login successful.")
            else:
                processed_user_details[username] = {
                    'token': None, 'status': 'Login FAILED after create/verify'}
                print(
                    f"WARNING: User {username} created/verified, but subsequent login failed.")
        else:
            # Creation failed (and not because it already existed with a 409 treated as success)
            processed_user_details[username] = {
                'token': None, 'status': 'Creation FAILED'}
            print(
                f"ERROR: Failed to create or verify user {username}. Skipping login attempt.")

        time.sleep(0.1)  # Small delay between processing each user

    successful_logins = sum(
        1 for details in processed_user_details.values() if details['token'])
    print(
        f"\nFinished processing users. Successfully logged in {successful_logins} out of {len(users_to_process)} users.")
    return processed_user_details


# --- Main Execution ---

def main():
    """Main script execution flow."""
    args = parse_arguments()

    admin_token = perform_admin_login(args.api_url)
    if not admin_token:
        print("Exiting due to admin login failure.")
        return

    users_to_process = prepare_user_list(args)
    if not users_to_process:
        print("No users to process. Exiting.")
        return

    processed_details = process_users_creation_and_login(
        users_to_process, args.api_url, admin_token
    )

    print("\n--- User Processing Summary ---")
    for username, details in processed_details.items():
        print(
            f"User: {username}, Status: {details['status']}, Token: {'Yes' if details['token'] else 'No'}")

    if args.create_users_only:
        print("\n--create-users-only flag is set. Script finished after user creation and login attempts.")
        return

    print("\n--- Script Finished ---")


if __name__ == "__main__":
    main()
