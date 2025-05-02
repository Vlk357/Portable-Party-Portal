import os
import argparse
import json
import random
import string
import time
import threading
# Remove ssl and websocket imports if no longer needed elsewhere
# import ssl
# import websocket
from typing import List, Dict, Optional, Any
import requests
import socketio # Import the socketio library

# --- Constants ---
DEFAULT_API_BASE_URL = "http://127.0.0.1:8080/auth/api"
# Use the base HTTP URL for socketio connection
DEFAULT_WS_BASE_URL = "http://127.0.0.1:8080" # Socket.IO connects via HTTP/S first
DEFAULT_ROOM_ID = 1
DEFAULT_NUM_MESSAGES = 3
DEFAULT_DELAY_S = 0.5
PASSWORD_LENGTH = 12
ADMIN_USERNAME_ENV = "AUTH_ADMIN_USERNAME"
ADMIN_PASSWORD_ENV = "AUTH_ADMIN_PASSWORD"

# --- Helper Functions ---


def generate_random_string(length: int) -> str:
    """Generates a random alphanumeric string."""
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for i in range(length))


def generate_password(length: int = PASSWORD_LENGTH) -> str:
    """Generates a random password with letters, digits, and symbols."""
    characters = string.ascii_letters + string.digits + string.punctuation
    # Ensure at least one of each category if needed, but keep simple for now
    password = ''.join(random.choice(characters) for i in range(length))
    # Basic complexity check (example)
    if not any(c.islower() for c in password):
        password += random.choice(string.ascii_lowercase)
    if not any(c.isupper() for c in password):
        password += random.choice(string.ascii_uppercase)
    if not any(c.isdigit() for c in password):
        password += random.choice(string.digits)
    # Trim back to length if needed
    return password[:length]


def load_users_from_file(filepath: str, generate_passwords: bool) -> List[Dict[str, str]]:
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
                if not password or generate_passwords:
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


def generate_users(num_users: int) -> List[Dict[str, str]]:
    """Generates a list of random users."""
    users = []
    for i in range(num_users):
        username = f"testuser_{generate_random_string(6)}"
        password = generate_password()
        users.append({'username': username, 'password': password})
    print(f"Generated {len(users)} random users.")
    return users

# --- API Interaction Functions ---


# Modified create_user to accept and use admin_token
def create_user(api_url: str, username: str, password: str, admin_token: str) -> bool:
    """Attempts to create a user via the API using an admin token."""
    # Assuming the user creation endpoint requires admin privileges
    # Adjust endpoint if it's different (e.g., /admin/user)
    register_url = f"{api_url}/user"
    payload = {'username': username, 'password': password}
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    try:
        # Add headers to the request
        response = requests.post(
            register_url, headers=headers, json=payload, timeout=10)
        if response.status_code == 201:
            print(f"Successfully created user: {username} (using admin token)")
            return True
        elif response.status_code == 409:
            print(
                f"User {username} likely already exists (status {response.status_code}).")
            # Treat as success for the script's purpose if it already exists
            return True
        elif response.status_code == 401 or response.status_code == 403:
            print(
                f"Failed to create user {username}. Admin token invalid or insufficient permissions. Status: {response.status_code}")
            return False  # Don't continue if admin token is bad
        else:
            print(
                f"Failed to create user {username}. Status: {response.status_code}, Response: {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"Error creating user {username}: {e}")
        return False


def login_user(api_url: str, username: str, password: str) -> Optional[str]:
    """Attempts to log in a user and returns the auth token."""
    login_url = f"{api_url}/login"  # Assuming /login endpoint
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

# --- Socket.IO Interaction Functions ---

# Global dictionary to hold active socketio clients, keyed by username or token
# This simplifies managing multiple connections
sio_clients: Dict[str, socketio.Client] = {}
# Use threading events to wait for connection confirmation
connection_events: Dict[str, threading.Event] = {}
connection_success: Dict[str, bool] = {}


def connect_socketio(ws_url: str, token: str, username: str) -> Optional[socketio.Client]:
    """Connects to the Socket.IO server with authentication."""
    print(f"Attempting Socket.IO connection for {username} to {ws_url}...")

    sio = socketio.Client(logger=False, engineio_logger=False) # Disable verbose logging
    connection_events[username] = threading.Event()
    connection_success[username] = False

    # Define event handlers specific to this client instance
    @sio.event
    def connect():
        print(f"Socket.IO connected successfully for {username} (sid: {sio.sid})")
        connection_success[username] = True
        connection_events[username].set() # Signal that connection attempt finished

    @sio.event
    def connect_error(data):
        print(f"Socket.IO connection failed for {username}: {data}")
        connection_success[username] = False
        connection_events[username].set() # Signal that connection attempt finished

    @sio.event
    def disconnect():
        print(f"Socket.IO disconnected for {username}")
        # Optionally handle reconnection logic here if needed
        connection_success[username] = False # Mark as disconnected
        if username in sio_clients:
             del sio_clients[username] # Clean up client reference


    @sio.on('*') # Catch-all for other events for debugging
    def any_event(event, data):
        print(f"< Received event '{event}' for {username}: {str(data)[:150]}")


    try:
        # Connect with authentication data
        # The path='/socket.io/' is often the default but specify if needed
        sio.connect(
            ws_url,
            auth={"token": token},
            transports=['websocket'], # Force websocket transport
            wait_timeout=10,
            socketio_path='/socket.io/' # Explicitly set the path based on Nginx config
        )

        # Wait for the connection attempt to complete (or timeout)
        connection_established = connection_events[username].wait(timeout=15) # Wait up to 15s

        if connection_established and connection_success[username]:
             sio_clients[username] = sio # Store the connected client
             return sio
        else:
            print(f"Socket.IO connection attempt timed out or failed for {username}.")
            # Ensure disconnect is called if connect_error didn't fire but failed
            if sio.connected:
                sio.disconnect()
            return None

    except socketio.exceptions.ConnectionError as e:
        print(f"Socket.IO connection error for {username}: {e}")
        return None
    except Exception as e:
         print(f"Unexpected error during Socket.IO connection for {username}: {e}")
         return None
    finally:
        # Clean up the event for this user
        if username in connection_events:
            del connection_events[username]
        if username in connection_success:
            del connection_success[username]


def send_chat_message_sio(sio_client: socketio.Client, room_id: int, message_content: str, username: str):
    """Sends a chat message event over Socket.IO."""
    if not sio_client or not sio_client.connected:
        print(f"Cannot send message for {username}: Socket.IO client is not connected.")
        return

    # ADJUST 'sendMessage' and payload structure TO YOUR BACKEND'S EXPECTATION
    event_name = 'sendMessage'
    payload = {
        "roomId": room_id,
        "content": message_content
    }
    try:
        print(f"> {username} sending '{event_name}': {payload}")
        sio_client.emit(event_name, payload)
    except Exception as e:
        print(f"Error sending message via Socket.IO for {username}: {e}")


def close_socketio(sio_client: Optional[socketio.Client], username: str):
    """Closes the Socket.IO connection."""
    if sio_client and sio_client.connected:
        print(f"Closing Socket.IO connection for {username}...")
        try:
            sio_client.disconnect()
        except Exception as e:
            print(f"Error disconnecting Socket.IO for {username}: {e}")
    # Clean up reference if it exists
    if username in sio_clients:
        del sio_clients[username]


# --- Main Workflow Functions ---

def parse_arguments() -> argparse.Namespace:
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Chat Application Test Script")
    parser.add_argument("--api-url", default=DEFAULT_API_BASE_URL,
                        help="Base URL for the Auth API")
    # Changed help text slightly for WS URL
    parser.add_argument("--ws-url", default=DEFAULT_WS_BASE_URL,
                        help="Base URL for the Socket.IO server (e.g., http://host:port)")
    parser.add_argument("--room-id", type=int, default=DEFAULT_ROOM_ID,
                        help="ID of the chat room to send messages to")
    parser.add_argument(
        "--user-file", type=str, help="Path to JSON file containing user credentials ([{'username': 'u', 'password': 'p'}, ...])")
    parser.add_argument("--num-users", type=int, default=2,
                        help="Number of users to generate if --user-file is not provided")
    parser.add_argument("--generate-passwords", action="store_true",
                        help="Generate passwords even if usernames are provided in --user-file")
    parser.add_argument("--num-messages", type=int, default=DEFAULT_NUM_MESSAGES,
                        help="Number of messages EACH user sends")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_S,
                        help="Delay (seconds) between messages")
    return parser.parse_args()


def perform_admin_login(api_url: str) -> Optional[str]:
    """Logs in the admin user using environment variables."""
    print("\n--- Admin Login ---")
    admin_username = os.environ.get(ADMIN_USERNAME_ENV)
    admin_password = os.environ.get(ADMIN_PASSWORD_ENV)

    if not admin_username or not admin_password:
        print(f"Error: Admin credentials not found in environment variables.")
        print(f"Please set {ADMIN_USERNAME_ENV} and {ADMIN_PASSWORD_ENV}.")
        return None

    admin_token = login_user(api_url, admin_username, admin_password)

    if not admin_token:
        print("Admin login failed. Cannot proceed.")
        return None

    print("Admin login successful.")
    return admin_token


def prepare_user_list(args: argparse.Namespace) -> List[Dict[str, str]]:
    """Loads users from file or generates them based on arguments."""
    print("\n--- Preparing User List ---")
    users_to_process: List[Dict[str, str]] = []
    if args.user_file:
        users_to_process = load_users_from_file(
            args.user_file, args.generate_passwords)
    else:
        users_to_process = generate_users(args.num_users)

    if not users_to_process:
        print("No users specified to process.")
    else:
        print(f"Prepared {len(users_to_process)} users for processing.")
    return users_to_process


def process_users(
    users_to_process: List[Dict[str, str]],
    api_url: str,
    admin_token: str,
    from_file: bool
) -> Dict[str, Dict[str, Any]]:
    """Processes users: creates and logs them in."""
    print("\n--- Processing Users (Create/Login) ---")
    logged_in_users: Dict[str, Dict[str, Any]] = {} # username -> {'token': str}

    for user in users_to_process:
        username = user['username']
        password = user['password']
        token = None

        if from_file:
            print(f"Attempting login for existing user: {username}...")
            token = login_user(api_url, username, password)
            if token:
                print(f"User {username} already exists and logged in successfully.")
                logged_in_users[username] = {'token': token} # Store only token initially
            else:
                print(f"Login failed for {username}. Attempting creation...")
                if create_user(api_url, username, password, admin_token):
                    print(f"Attempting login again for {username} after creation attempt...")
                    token = login_user(api_url, username, password)
                    if token:
                        logged_in_users[username] = {'token': token}
                    else:
                        print(f"WARNING: Created/verified user {username} but failed subsequent login.")
                else:
                    print(f"ERROR: Failed to create user {username}. Skipping.")
        else:
            print(f"Attempting creation for generated user: {username}...")
            if create_user(api_url, username, password, admin_token):
                print(f"Attempting login for {username} after creation attempt...")
                token = login_user(api_url, username, password)
                if token:
                    logged_in_users[username] = {'token': token}
                else:
                    print(f"WARNING: Created/verified user {username} but failed subsequent login.")
            else:
                print(f"ERROR: Failed to create user {username}. Skipping.")

        time.sleep(0.1)

    print(f"\nSuccessfully processed and logged in {len(logged_in_users)} users.")
    return logged_in_users


# Modified to use connect_socketio and store client in logged_in_users
def connect_user_socketio(
    logged_in_users: Dict[str, Dict[str, Any]], # Now username -> {'token': str}
    ws_url: str
):
    """Connects Socket.IO clients for logged-in users."""
    print("\n--- Connecting Socket.IO Clients ---")
    usernames_to_connect = list(logged_in_users.keys())

    threads = []
    for username in usernames_to_connect:
        token = logged_in_users[username]['token']
        # Run each connection in a separate thread to parallelize
        thread = threading.Thread(target=connect_socketio, args=(ws_url, token, username), daemon=True)
        threads.append(thread)
        thread.start()

    # Wait for all connection threads to finish
    for thread in threads:
        thread.join()

    # Update logged_in_users, removing those that failed to connect
    connected_count = 0
    for username in usernames_to_connect[:]: # Iterate copy for safe removal
        if username in sio_clients and sio_clients[username].connected:
             logged_in_users[username]['sio'] = sio_clients[username] # Add client to dict
             connected_count += 1
        else:
            print(f"Removing user {username} due to connection failure.")
            del logged_in_users[username] # Remove user if connection failed

    if connected_count == 0:
        print("No active Socket.IO connections established.")
    else:
        print(f"Established {connected_count} Socket.IO connections.")


# Modified to use send_chat_message_sio
def simulate_conversation_sio(
    logged_in_users: Dict[str, Dict[str, Any]], # username -> {'token': str, 'sio': Client}
    room_id: int,
    num_messages: int,
    delay: float
):
    """Simulates users sending messages via Socket.IO."""
    print(f"\n--- Simulating Conversation (Room ID: {room_id}) ---")
    if not logged_in_users:
        print("No users available to simulate conversation.")
        return

    user_list = list(logged_in_users.items())
    user_index = 0
    total_messages_to_send = num_messages * len(user_list)
    print(f"Sending {num_messages} messages per user, total {total_messages_to_send} messages...")

    for i in range(total_messages_to_send):
        username, user_data = user_list[user_index % len(user_list)]
        sio_client = user_data.get('sio')
        message_num_for_user = (i // len(user_list)) + 1

        if sio_client:
            message_content = f"Hello from {username}! This is message #{message_num_for_user}."
            send_chat_message_sio(sio_client, room_id, message_content, username)
        else:
            print(f"Skipping message for {username} - Socket.IO client not connected.")

        user_index += 1
        time.sleep(delay)


# Modified to use close_socketio
def cleanup_socketio_clients():
    """Closes all active Socket.IO connections."""
    print("\n--- Cleaning Up Socket.IO Clients ---")
    # Iterate over a copy of usernames as close_socketio modifies the dict
    usernames = list(sio_clients.keys())
    closed_count = 0
    for username in usernames:
        if username in sio_clients:
             close_socketio(sio_clients[username], username)
             closed_count += 1
    print(f"Closed {closed_count} Socket.IO connections.")


# --- Main Execution ---

def main():
    """Main script execution flow using Socket.IO."""
    args = parse_arguments()

    admin_token = perform_admin_login(args.api_url)
    if not admin_token: return

    users_to_process = prepare_user_list(args)
    if not users_to_process: return

    # logged_in_users now contains username -> {'token': str}
    logged_in_users = process_users(
        users_to_process, args.api_url, admin_token, bool(args.user_file)
    )
    if not logged_in_users: return

    # Connect clients and update logged_in_users with {'sio': Client}
    connect_user_socketio(logged_in_users, args.ws_url)

    # Check again if any connections succeeded
    if not logged_in_users:
        print("No users connected via Socket.IO. Exiting.")
        return

    simulate_conversation_sio(
        logged_in_users, args.room_id, args.num_messages, args.delay
    )

    cleanup_socketio_clients()

    print("\n--- Script Finished ---")
    # Add a small delay to allow background threads to fully close if needed
    time.sleep(1)


if __name__ == "__main__":
    main()
