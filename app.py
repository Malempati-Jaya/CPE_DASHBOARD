from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import oracledb
from dotenv import load_dotenv

# ✅ Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

try:
    oracledb.init_oracle_client(lib_dir=r"C:\oracle\instantclient_21_19")
except oracledb.DatabaseError as e:
    print("Oracle Client already initialized or failed:", e)

# Oracle database connection configuration
DB_CONFIG = {
    'user': 'pinview',
    'password': 'pinview',
    'dsn': '172.20.20.23:1723/pindb'
}

# Optional test connection
try:
    connection = oracledb.connect(**DB_CONFIG)
    print("✅ Connected to Oracle DB successfully")
    connection.close()
except Exception as e:
    print("❌ Failed to connect to Oracle DB:", e)

# Function to get Oracle database connection
def get_db_connection():
    try:
        connection = oracledb.connect(**DB_CONFIG)
        print("Database connection successful")
        return connection
    except oracledb.DatabaseError as e:
        print(f"Error connecting to Oracle database: {e}")
        return None

# Custom row factory to return dictionary
def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

# Validate query to ensure only SELECT is allowed
def is_select_query(query):
    query_upper = query.strip().upper()
    return query_upper.startswith('SELECT') and not any(
        cmd in query_upper for cmd in ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE']
    )

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/devices')
def get_devices():
    search = request.args.get('search', '')
    category = request.args.get('category', '')
    acceptance_status = request.args.get('acceptance_status', '')
    allocation_status = request.args.get('allocation_status', '')
    state_city = request.args.get('state_city', '')
    flow_type = request.args.get('flow_type', '')
    ticket_type = request.args.get('ticket_type', '')
    sort_by = request.args.get('sort_by', 'DEVICE_ID')
    sort_order = request.args.get('sort_order', 'ASC')

    query = """
        SELECT 
            DEVICE_ID,
            DEVICE_SERIAL_NO,
            MAKE || ' ' || MODEL AS MODEL_MAKE,
            CATEGORY,
            FROM_WH || ' to ' || TO_LOCATOR AS FROM_WHTO_LOCATOR,
            WH_NAME AS LOCATION_NAME,
            STATE || ', ' || CITY AS STATE_CITY,
            LOCATION_MOVEMENT_DATE,
            L1_ACCOUNT_NO,
            L1_NAME,
            DATE_OF_L1_ACCEPTANCE,
            L1_ACCEPTANCE_APP,
            L2_ACCOUNT_NO,
            L2_NAME,
            DATE_OF_L2_ACCEPTANCE,
            L2_ACCEPTANCE_APP,
            ENGG_ACCOUNT_NO,
            ENGG_NAME,
            L1_ASSIGNED_TO_ENGG,
            DATE_OF_ENGG_ASSIGNMENT,
            DATE_OF_ENGG_ACCEPTANCE,
            ACCEPTANCE_STATUS,
            FLOW_TYPE,
            TICKET_NO,
            TICKET_DATE,
            TYPE_OF_TICKET,
            TICKET_STATUS,
            CUSTOMER_ACCOUNT_NO,
            CUSTOMER_NAME,
            DATE_OF_CUSTOMER_ALLOCATION,
            STATE_ID AS DEVICE_ALLOCATION_STATUS,
            CURRENT_LOCATION_USER_ID,
            LOCATION_FIRST_NAME,
            LOCATION_LAST_NAME,
            STATE,
            CITY,
            STATE_ID,
            POID_ID0
        FROM pin.mso_cpe_tracking_report
        WHERE 1=1
    """
    params = []

    if search:
        query += " AND (DEVICE_ID LIKE :1 OR DEVICE_SERIAL_NO LIKE :2 OR CUSTOMER_NAME LIKE :3 OR (MAKE || ' ' || MODEL) LIKE :4)"
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param, search_param])

    if category:
        query += " AND CATEGORY = :{}".format(len(params) + 1)
        params.append(category)

    if acceptance_status:
        query += " AND ACCEPTANCE_STATUS = :{}".format(len(params) + 1)
        params.append(acceptance_status)

    if allocation_status:
        query += " AND STATE_ID = :{}".format(len(params) + 1)
        params.append(allocation_status)

    if state_city:
        query += " AND (NVL(STATE, '') || ', ' || NVL(CITY, '')) = :{}".format(len(params) + 1)
        params.append(state_city.strip())

    if flow_type:
        query += " AND FLOW_TYPE = :{}".format(len(params) + 1)
        params.append(flow_type)

    if ticket_type:
        query += " AND TYPE_OF_TICKET = :{}".format(len(params) + 1)
        params.append(ticket_type)

    allowed_sort_fields = [
        'DEVICE_ID', 'DEVICE_SERIAL_NO', 'MODEL_MAKE', 'CATEGORY', 'FROM_WHTO_LOCATOR',
        'LOCATION_NAME', 'STATE_CITY', 'LOCATION_MOVEMENT_DATE', 'L1_ACCOUNT_NO', 'L1_NAME',
        'DATE_OF_L1_ACCEPTANCE', 'L1_ACCEPTANCE_APP', 'L2_ACCOUNT_NO', 'L2_NAME',
        'DATE_OF_L2_ACCEPTANCE', 'L2_ACCEPTANCE_APP', 'ENGG_ACCOUNT_NO', 'ENGG_NAME',
        'L1_ASSIGNED_TO_ENGG', 'DATE_OF_ENGG_ASSIGNMENT', 'DATE_OF_ENGG_ACCEPTANCE',
        'ACCEPTANCE_STATUS', 'FLOW_TYPE', 'TICKET_NO', 'TICKET_DATE', 'TYPE_OF_TICKET',
        'TICKET_STATUS', 'CUSTOMER_ACCOUNT_NO', 'CUSTOMER_NAME', 'DATE_OF_CUSTOMER_ALLOCATION',
        'DEVICE_ALLOCATION_STATUS', 'CURRENT_LOCATION_USER_ID', 'LOCATION_FIRST_NAME',
        'LOCATION_LAST_NAME', 'STATE', 'CITY', 'STATE_ID', 'POID_ID0'
    ]
    if sort_by not in allowed_sort_fields:
        sort_by = 'DEVICE_ID'
    if sort_by == 'MODEL_MAKE':
        sort_by = "(MAKE || ' ' || MODEL)"
    elif sort_by == 'STATE_CITY':
        sort_by = "(STATE || ', ' || CITY)"
    elif sort_by == 'FROM_WHTO_LOCATOR':
        sort_by = "(FROM_WH || ' to ' || TO_LOCATOR)"
    elif sort_by == 'LOCATION_NAME':
        sort_by = 'WH_NAME'
    elif sort_by == 'DEVICE_ALLOCATION_STATUS':
        sort_by = 'STATE_ID'
    query += f" ORDER BY {sort_by} {sort_order}"

    if not is_select_query(query):
        return jsonify({'error': 'Only SELECT queries are allowed'}), 403

    try:
        connection = get_db_connection()
        if not connection:
            return jsonify([]), 500
        cursor = connection.cursor()
        cursor.execute(query, params)
        cursor.rowfactory = lambda *args: dict_factory(cursor, args)
        devices = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(devices if devices else [])
    except oracledb.DatabaseError as e:
        print(f"Error fetching devices: {e}")
        return jsonify([]), 500

@app.route('/api/devices/paginated')
def get_paginated_devices():
    search = request.args.get('search', '')
    category = request.args.get('category', '')
    acceptance_status = request.args.get('acceptance_status', '')
    allocation_status = request.args.get('allocation_status', '')
    state_city = request.args.get('state_city', '')
    flow_type = request.args.get('flow_type', '')
    ticket_type = request.args.get('ticket_type', '')
    sort_by = request.args.get('sort_by', 'DEVICE_ID')
    sort_order = request.args.get('sort_order', 'ASC')
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))

    query = """
        SELECT 
            DEVICE_ID,
            DEVICE_SERIAL_NO,
            MAKE || ' ' || MODEL AS MODEL_MAKE,
            CATEGORY,
            FROM_WH || ' to ' || TO_LOCATOR AS FROM_WHTO_LOCATOR,
            WH_NAME AS LOCATION_NAME,
            STATE || ', ' || CITY AS STATE_CITY,
            LOCATION_MOVEMENT_DATE,
            L1_ACCOUNT_NO,
            L1_NAME,
            DATE_OF_L1_ACCEPTANCE,
            L1_ACCEPTANCE_APP,
            L2_ACCOUNT_NO,
            L2_NAME,
            DATE_OF_L2_ACCEPTANCE,
            L2_ACCEPTANCE_APP,
            ENGG_ACCOUNT_NO,
            ENGG_NAME,
            L1_ASSIGNED_TO_ENGG,
            DATE_OF_ENGG_ASSIGNMENT,
            DATE_OF_ENGG_ACCEPTANCE,
            ACCEPTANCE_STATUS,
            FLOW_TYPE,
            TICKET_NO,
            TICKET_DATE,
            TYPE_OF_TICKET,
            TICKET_STATUS,
            CUSTOMER_ACCOUNT_NO,
            CUSTOMER_NAME,
            DATE_OF_CUSTOMER_ALLOCATION,
            STATE_ID AS DEVICE_ALLOCATION_STATUS,
            CURRENT_LOCATION_USER_ID,
            LOCATION_FIRST_NAME,
            LOCATION_LAST_NAME,
            STATE,
            CITY,
            STATE_ID,
            POID_ID0
        FROM pin.mso_cpe_tracking_report
        WHERE 1=1
    """
    params = []

    if search:
        query += " AND (DEVICE_ID LIKE :1 OR DEVICE_SERIAL_NO LIKE :2 OR CUSTOMER_NAME LIKE :3 OR (MAKE || ' ' || MODEL) LIKE :4)"
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param, search_param])

    if category:
        query += " AND CATEGORY = :{}".format(len(params) + 1)
        params.append(category)

    if acceptance_status:
        query += " AND ACCEPTANCE_STATUS = :{}".format(len(params) + 1)
        params.append(acceptance_status)

    if allocation_status:
        query += " AND STATE_ID = :{}".format(len(params) + 1)
        params.append(allocation_status)

    if state_city:
        query += " AND (NVL(STATE, '') || ', ' || NVL(CITY, '')) = :{}".format(len(params) + 1)
        params.append(state_city.strip())

    if flow_type:
        query += " AND FLOW_TYPE = :{}".format(len(params) + 1)
        params.append(flow_type)

    if ticket_type:
        query += " AND TYPE_OF_TICKET = :{}".format(len(params) + 1)
        params.append(ticket_type)

    allowed_sort_fields = [
        'DEVICE_ID', 'DEVICE_SERIAL_NO', 'MODEL_MAKE', 'CATEGORY', 'FROM_WHTO_LOCATOR',
        'LOCATION_NAME', 'STATE_CITY', 'LOCATION_MOVEMENT_DATE', 'L1_ACCOUNT_NO', 'L1_NAME',
        'DATE_OF_L1_ACCEPTANCE', 'L1_ACCEPTANCE_APP', 'L2_ACCOUNT_NO', 'L2_NAME',
        'DATE_OF_L2_ACCEPTANCE', 'L2_ACCEPTANCE_APP', 'ENGG_ACCOUNT_NO', 'ENGG_NAME',
        'L1_ASSIGNED_TO_ENGG', 'DATE_OF_ENGG_ASSIGNMENT', 'DATE_OF_ENGG_ACCEPTANCE',
        'ACCEPTANCE_STATUS', 'FLOW_TYPE', 'TICKET_NO', 'TICKET_DATE', 'TYPE_OF_TICKET',
        'TICKET_STATUS', 'CUSTOMER_ACCOUNT_NO', 'CUSTOMER_NAME', 'DATE_OF_CUSTOMER_ALLOCATION',
        'DEVICE_ALLOCATION_STATUS', 'CURRENT_LOCATION_USER_ID', 'LOCATION_FIRST_NAME',
        'LOCATION_LAST_NAME', 'STATE', 'CITY', 'STATE_ID', 'POID_ID0'
    ]
    if sort_by not in allowed_sort_fields:
        sort_by = 'DEVICE_ID'
    if sort_by == 'MODEL_MAKE':
        sort_by = "(MAKE || ' ' || MODEL)"
    elif sort_by == 'STATE_CITY':
        sort_by = "(STATE || ', ' || CITY)"
    elif sort_by == 'FROM_WHTO_LOCATOR':
        sort_by = "(FROM_WH || ' to ' || TO_LOCATOR)"
    elif sort_by == 'LOCATION_NAME':
        sort_by = 'WH_NAME'
    elif sort_by == 'DEVICE_ALLOCATION_STATUS':
        sort_by = 'STATE_ID'
    query += f" ORDER BY {sort_by} {sort_order}"

    offset = (page - 1) * per_page
    query += f" OFFSET :{len(params) + 1} ROWS FETCH NEXT :{len(params) + 2} ROWS ONLY"
    params.extend([offset, per_page])

    if not is_select_query(query):
        return jsonify({'error': 'Only SELECT queries are allowed'}), 403

    try:
        connection = get_db_connection()
        if not connection:
            return jsonify([]), 500
        cursor = connection.cursor()
        cursor.execute(query, params)
        cursor.rowfactory = lambda *args: dict_factory(cursor, args)
        devices = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(devices if devices else [])
    except oracledb.DatabaseError as e:
        print(f"Error fetching paginated devices: {e}")
        return jsonify([]), 500

@app.route('/api/filters')
def get_filter_options():
    queries = {
        'categories': "SELECT DISTINCT CATEGORY FROM pin.mso_cpe_tracking_report ORDER BY CATEGORY",
        'acceptance_statuses': "SELECT DISTINCT ACCEPTANCE_STATUS FROM pin.mso_cpe_tracking_report ORDER BY ACCEPTANCE_STATUS",
        'allocation_statuses': "SELECT DISTINCT STATE_ID FROM pin.mso_cpe_tracking_report ORDER BY STATE_ID",
        'state_cities': "SELECT DISTINCT NVL(STATE, '') || ', ' || NVL(CITY, '') AS STATE_CITY FROM pin.mso_cpe_tracking_report ORDER BY STATE_CITY",
        'flow_types': "SELECT DISTINCT FLOW_TYPE FROM pin.mso_cpe_tracking_report ORDER BY FLOW_TYPE",
        'ticket_types': "SELECT DISTINCT TYPE_OF_TICKET FROM pin.mso_cpe_tracking_report ORDER BY TYPE_OF_TICKET"
    }

    filters = {}
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor()

        for key, query in queries.items():
            if not is_select_query(query):
                return jsonify({'error': 'Only SELECT queries are allowed'}), 403
            cursor.execute(query)
            filters[key] = [row[0] for row in cursor.fetchall() if row[0] is not None]

        cursor.close()
        connection.close()
        return jsonify(filters)
    except oracledb.DatabaseError as e:
        print(f"Error fetching filter options: {e}")
        return jsonify({'error': 'Database error'}), 500

@app.route('/api/dashboard-stats')
def get_dashboard_stats():
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    queries = {
        'total_devices': "SELECT COUNT(*) FROM pin.mso_cpe_tracking_report",
        'allocated': "SELECT COUNT(*) FROM pin.mso_cpe_tracking_report WHERE STATE_ID = 'ALLOCATED'",
        'available': "SELECT COUNT(*) FROM pin.mso_cpe_tracking_report WHERE STATE_ID = 'GOOD'",
        'repaired': "SELECT COUNT(*) FROM pin.mso_cpe_tracking_report WHERE STATE_ID = 'REPAIRED'",
        'repairing': "SELECT COUNT(*) FROM pin.mso_cpe_tracking_report WHERE STATE_ID = 'REPAIRING'",
        'faulty': "SELECT COUNT(*) FROM pin.mso_cpe_tracking_report WHERE STATE_ID = 'FAULTY'"
    }

    stats = {}
    try:
        cursor = connection.cursor()
        for key, query in queries.items():
            cursor.execute(query)
            result = cursor.fetchone()
            stats[key] = result[0] if result else 0
        cursor.close()
    except oracledb.DatabaseError as e:
        print(f"Query error: {e}")
        return jsonify({'error': 'Query execution failed'}), 500
    finally:
        connection.close()
    
    print(f"Dashboard stats: {stats}")
    return jsonify(stats)

if __name__ == '__main__':
    try:
        app.run(debug=True, host='0.0.0.0', port=5001)
    except Exception as e:
        print(f"Server startup error: {e}")