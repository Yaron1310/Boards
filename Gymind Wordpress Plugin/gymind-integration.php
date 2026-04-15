<?php
/**
 * Plugin Name:       Gymind Integration for Wordpress
 * Plugin URI:        https://gymind.app/
 * Description:       Integrates WooCommerce with Gymind to provision users upon purchase of specific products.
 * Version:           2.0.0
 * Author:            Gymind
 * Author URI:        https://gymind.app/
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       gymind-integration
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * WC requires at least: 6.0
 * WC tested up to: 8.4
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

// Register the activation hook from the main plugin file scope
register_activation_hook(__FILE__, ['Gymind_Integration_Plugin', 'plugin_activation']);

class Gymind_Integration_Plugin {

    private static $instance;
    const OPTION_NAME = 'gymind_integration_settings';
    const LOG_TABLE_NAME = 'gymind_provision_log';

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Wait until plugins are loaded to check for WooCommerce
        add_action('plugins_loaded', [$this, 'init']);
    }

    public function init() {
        // Check if WooCommerce is active
        if (!class_exists('WooCommerce')) {
            add_action('admin_notices', [$this, 'notice_missing_woocommerce']);
            return;
        }
        
        // Add the admin menu for the settings page
        add_action('admin_menu', [$this, 'add_admin_menu']);
        
        // Hook into admin pages to enqueue our scripts
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_scripts']);

        // Register REST API endpoints for settings management
        add_action('rest_api_init', [$this, 'register_api_routes']);

        // The core logic hook for order status changes
        add_action('woocommerce_order_status_changed', [$this, 'handle_order_status_change'], 10, 4);

        // Checkout: Add organization name field to billing section (only if no company field exists)
        add_filter('woocommerce_billing_fields', [$this, 'maybe_add_org_name_billing_field']);
        add_action('woocommerce_checkout_process', [$this, 'validate_checkout_org_name']);
        add_action('woocommerce_checkout_create_order', [$this, 'save_checkout_org_name_to_order'], 10, 2);
    }
    
    public static function plugin_activation() {
        global $wpdb;
        $table_name = $wpdb->prefix . self::LOG_TABLE_NAME;
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE $table_name (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            order_id bigint(20) UNSIGNED NOT NULL,
            customer_name varchar(255) NOT NULL,
            customer_email varchar(255) NOT NULL,
            product_id bigint(20) UNSIGNED NOT NULL,
            product_name varchar(255) NOT NULL,
            organization_id varchar(255) NOT NULL,
            organization_name varchar(255) NOT NULL,
            status varchar(50) NOT NULL,
            response_code smallint(5),
            response_message text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id),
            KEY order_id (order_id)
        ) $charset_collate;";

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }

    public function notice_missing_woocommerce() {
        echo '<div class="error"><p><strong>Gymind Integration:</strong> WooCommerce must be installed and active for this plugin to function.</p></div>';
    }

    public function add_admin_menu() {
        add_menu_page(
            'Gymind Integration', // Title
            'Gymind', // Menu Title
            'manage_options',
            'gymind-integration-settings',
            [$this, 'render_react_app'],
            plugin_dir_url(__FILE__) . 'assets/wp_logo.png',
            56
        );
        add_submenu_page(
            'gymind-integration-settings',
            'Settings', // Page Title
            'Settings', // Menu Title
            'manage_options',
            'gymind-integration-settings',
            [$this, 'render_react_app']
        );
        add_submenu_page(
            'gymind-integration-settings',
            'Users', // Page Title
            'Users', // Menu Title
            'manage_options',
            'gymind-integration-users',
            [$this, 'render_react_app']
        );
    }

    public function render_react_app() {
        // This is where our React app will mount
        echo '<div class="wrap"><div id="root"></div></div>';
    }

    public function enqueue_admin_scripts($hook) {
        $valid_hooks = [
            'toplevel_page_gymind-integration-settings', // Main menu link
            'gymind_page_gymind-integration-settings',   // Settings submenu link
            'gymind_page_gymind-integration-users'       // Users submenu link
        ];

        if (!in_array($hook, $valid_hooks)) {
            return;
        }

        $script_path = plugin_dir_url(__FILE__) . 'index.js';
        $style_path = plugin_dir_url(__FILE__) . 'index.css';
        $version = filemtime(plugin_dir_path(__FILE__) . 'index.js');

        wp_enqueue_script(
            'gymind-integration-app',
            $script_path,
            ['wp-element'], // Dependencies
            $version,
            true
        );
        
        $page = isset($_GET['page']) ? sanitize_key($_GET['page']) : 'gymind-integration-settings';

        // Pass data from PHP to our JavaScript app
        wp_localize_script('gymind-integration-app', 'gymindPluginData', [
            'nonce' => wp_create_nonce('wp_rest'),
            'page' => $page,
            'logoUrl' => plugin_dir_url(__FILE__) . 'assets/logo_gym.webp',
            'endpoints' => [
                'settings' => rest_url('gymind/v1/settings'),
                'search' => rest_url('gymind/v1/search-products'),
                'plans' => rest_url('gymind/v1/plans'),
                'logs' => rest_url('gymind/v1/provision-logs'),
            ]
        ]);

        wp_enqueue_style(
            'gymind-integration-styles',
            $style_path,
            [],
            $version
        );
    }

    public function register_api_routes() {
        register_rest_route('gymind/v1', '/settings', [
            'methods' => 'GET',
            'callback' => [$this, 'get_settings'],
            'permission_callback' => [$this, 'can_manage_settings'],
        ]);
        register_rest_route('gymind/v1', '/settings', [
            'methods' => 'POST',
            'callback' => [$this, 'save_settings'],
            'permission_callback' => [$this, 'can_manage_settings'],
        ]);
        register_rest_route('gymind/v1', '/search-products', [
            'methods' => 'GET',
            'callback' => [$this, 'search_products'],
            'permission_callback' => [$this, 'can_manage_settings'],
        ]);
        register_rest_route('gymind/v1', '/plans', [
            'methods' => 'POST',
            'callback' => [$this, 'proxy_fetch_plans'],
            'permission_callback' => [$this, 'can_manage_settings'],
        ]);
        register_rest_route('gymind/v1', '/check-org-name', [
            'methods' => 'POST',
            'callback' => [$this, 'proxy_check_org_name'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('gymind/v1', '/provision-logs', [
            'methods' => 'GET',
            'callback' => [$this, 'get_provision_logs'],
            'permission_callback' => [$this, 'can_manage_settings'],
        ]);
        register_rest_route('gymind/v1', '/cancel-subscription', [
            'methods' => 'POST',
            'callback' => [$this, 'handle_cancel_webhook'],
            'permission_callback' => '__return_true', // Authentication is handled internally
        ]);
    }
    
    public function can_manage_settings() {
        return current_user_can('manage_options');
    }

    public function get_settings() {
        $settings = get_option(self::OPTION_NAME, [
            'apiKey' => '',
            'apiUrl' => 'https://studio.gymind.app/api/provision/woocommerce',
            'mappings' => [],
        ]);
        return new WP_REST_Response($settings, 200);
    }
    
    public function save_settings(WP_REST_Request $request) {
        $old_settings = get_option(self::OPTION_NAME, []);
        $old_api_key = $old_settings['apiKey'] ?? '';

        $settings = $request->get_json_params();
        
        $sanitized_settings = [
            'apiKey' => sanitize_text_field($settings['apiKey']),
            'apiUrl' => esc_url_raw($settings['apiUrl']),
            'mappings' => array_map(function($map) {
                return [
                    'id' => sanitize_text_field($map['id']),
                    'productId' => sanitize_text_field($map['productId']),
                    'productName' => sanitize_text_field($map['productName']),
                    'planId' => sanitize_text_field($map['planId'] ?? $map['organizationId'] ?? ''),
                    'planName' => sanitize_text_field($map['planName'] ?? $map['organizationName'] ?? ''),
                ];
            }, $settings['mappings'] ?? [])
        ];
        
        $new_api_key = $sanitized_settings['apiKey'];
        
        update_option(self::OPTION_NAME, $sanitized_settings);
        
        $webhook_result = ['status' => 'not_changed', 'message' => ''];
        if (!empty($new_api_key) && $new_api_key !== $old_api_key) {
            $this->log_message("API key changed. Attempting to register webhook.");
            $webhook_result = $this->register_gymind_webhook($new_api_key);
        }

        return new WP_REST_Response([
            'success' => true,
            'webhook_status' => $webhook_result['status'],
            'webhook_message' => $webhook_result['message']
        ], 200);
    }
    
    public function search_products(WP_REST_Request $request) {
        $search_term = sanitize_text_field($request->get_param('q'));
        if (empty($search_term)) {
            return new WP_REST_Response([], 200);
        }

        $query = new WC_Product_Query([
            's' => $search_term,
            'limit' => 20,
            'status' => 'publish',
            'return' => 'ids',
        ]);
        $product_ids = $query->get_products();
        $products = [];

        foreach ($product_ids as $id) {
            $product = wc_get_product($id);
            if ($product) {
                $products[] = ['id' => (string) $id, 'name' => $product->get_name()];
            }
        }
        
        return new WP_REST_Response($products, 200);
    }

    public function proxy_fetch_plans(WP_REST_Request $request) {
        $params = $request->get_json_params();
        $api_key = isset($params['apiKey']) ? sanitize_text_field($params['apiKey']) : '';
        $api_url = isset($params['apiUrl']) ? esc_url_raw($params['apiUrl']) : '';

        if (empty($api_key) || empty($api_url)) {
            return new WP_Error('missing_config', 'API Key or API URL must be provided to fetch plans.', ['status' => 400]);
        }

        $base_url = $this->get_api_base_url($api_url);
        if (!$base_url) {
            return new WP_Error('invalid_api_url', 'The provided API URL is invalid.', ['status' => 500]);
        }

        $plans_url = $base_url . '/api/provision/plans';

        $response = wp_remote_get($plans_url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type'  => 'application/json',
                'User-Agent'    => 'Gymind WooCommerce Integration/2.0.0',
            ],
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return new WP_Error('api_error', 'WordPress HTTP API Error: ' . $response->get_error_message(), ['status' => 500]);
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        if ($response_code >= 400) {
            $decoded_body = json_decode($response_body, true);
            $error_message = isset($decoded_body['message']) ? $decoded_body['message'] : 'Gymind API returned status ' . $response_code;
            return new WP_Error('gymind_api_error', $error_message, ['status' => $response_code]);
        }

        return new WP_REST_Response(json_decode($response_body, true), $response_code);
    }

    public function proxy_check_org_name(WP_REST_Request $request) {
        $params = $request->get_json_params();
        $api_key = isset($params['apiKey']) ? sanitize_text_field($params['apiKey']) : '';
        $api_url = isset($params['apiUrl']) ? esc_url_raw($params['apiUrl']) : '';
        $org_name = isset($params['name']) ? sanitize_text_field($params['name']) : '';

        if (empty($api_key) || empty($api_url) || empty($org_name)) {
            return new WP_Error('missing_params', 'apiKey, apiUrl, and name are required.', ['status' => 400]);
        }

        $base_url = $this->get_api_base_url($api_url);
        if (!$base_url) {
            return new WP_Error('invalid_api_url', 'The provided API URL is invalid.', ['status' => 500]);
        }

        $check_url = $base_url . '/api/provision/check-org-name?name=' . urlencode($org_name);

        $response = wp_remote_get($check_url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'User-Agent'    => 'Gymind WooCommerce Integration/2.0.0',
            ],
            'timeout' => 15,
        ]);

        if (is_wp_error($response)) {
            return new WP_Error('api_error', $response->get_error_message(), ['status' => 500]);
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        if ($response_code >= 400) {
            $decoded_body = json_decode($response_body, true);
            $error_message = isset($decoded_body['message']) ? $decoded_body['message'] : 'Gymind API returned status ' . $response_code;
            return new WP_Error('gymind_api_error', $error_message, ['status' => $response_code]);
        }

        return new WP_REST_Response(json_decode($response_body, true), $response_code);
    }

    private function get_api_base_url($api_url) {
        $url_parts = parse_url($api_url);
        if ($url_parts === false || !isset($url_parts['scheme']) || !isset($url_parts['host'])) {
            return false;
        }
        $base = $url_parts['scheme'] . '://' . $url_parts['host'];
        if (isset($url_parts['port'])) {
            $base .= ':' . $url_parts['port'];
        }
        return $base;
    }

    // --- WooCommerce Checkout: Organization Name Field ---

    private function cart_has_mapped_product() {
        if (!WC()->cart) return false;
        $settings = get_option(self::OPTION_NAME, []);
        $mappings = $settings['mappings'] ?? [];
        $mapped_product_ids = [];
        foreach ($mappings as $map) {
            if (!empty($map['productId'])) {
                $mapped_product_ids[] = $map['productId'];
            }
        }
        if (empty($mapped_product_ids)) return false;

        foreach (WC()->cart->get_cart() as $cart_item) {
            $product_id = (string) $cart_item['product_id'];
            $variation_id = (string) ($cart_item['variation_id'] ?? 0);
            $target_id = ($variation_id && $variation_id !== '0') ? $variation_id : $product_id;
            if (in_array($target_id, $mapped_product_ids)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if WooCommerce billing fields already contain a company/organization field.
     */
    private function billing_has_company_field($fields) {
        $company_keys = ['billing_company', 'billing_organization', 'billing_company_name', 'billing_organization_name'];
        foreach ($company_keys as $key) {
            if (isset($fields[$key])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Add organization name to billing fields, but only if no company field already exists.
     */
    public function maybe_add_org_name_billing_field($fields) {
        if (!$this->cart_has_mapped_product()) return $fields;

        // If WooCommerce (or another plugin) already provides a company/organization field, reuse it
        if ($this->billing_has_company_field($fields)) {
            // Make the existing company field required for Gymind orders
            foreach (['billing_company', 'billing_organization', 'billing_company_name', 'billing_organization_name'] as $key) {
                if (isset($fields[$key])) {
                    $fields[$key]['required'] = true;
                    break;
                }
            }
            return $fields;
        }

        // No existing company field — add our own in the billing section
        $fields['gymind_organization_name'] = [
            'type'        => 'text',
            'label'       => __('Organization Name', 'gymind-integration'),
            'placeholder' => __('Enter your organization name', 'gymind-integration'),
            'required'    => true,
            'class'       => ['form-row-wide'],
            'priority'    => 35, // After company field position (30), before address (40)
        ];

        return $fields;
    }

    /**
     * Get the organization name from POST data, checking our custom field and existing company fields.
     */
    private function get_org_name_from_post() {
        // Check our custom field first
        if (!empty($_POST['gymind_organization_name'])) {
            return sanitize_text_field(wp_unslash($_POST['gymind_organization_name']));
        }
        // Fall back to existing WooCommerce company/organization fields
        $fallback_keys = ['billing_company', 'billing_organization', 'billing_company_name', 'billing_organization_name'];
        foreach ($fallback_keys as $key) {
            if (!empty($_POST[$key])) {
                return sanitize_text_field(wp_unslash($_POST[$key]));
            }
        }
        return '';
    }

    public function validate_checkout_org_name() {
        if (!$this->cart_has_mapped_product()) return;

        $org_name = $this->get_org_name_from_post();

        if (empty($org_name)) {
            wc_add_notice(__('Please enter an organization name.', 'gymind-integration'), 'error');
            return;
        }

        if (strlen($org_name) < 2) {
            wc_add_notice(__('Organization name must be at least 2 characters.', 'gymind-integration'), 'error');
            return;
        }

        // Validate uniqueness against Gymind API
        $settings = get_option(self::OPTION_NAME, []);
        $api_key = $settings['apiKey'] ?? '';
        $api_url = $settings['apiUrl'] ?? '';

        if (empty($api_key) || empty($api_url)) return; // Skip validation if not configured

        $base_url = $this->get_api_base_url($api_url);
        if (!$base_url) return;

        $check_url = $base_url . '/api/provision/check-org-name?name=' . urlencode($org_name);
        $response = wp_remote_get($check_url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'User-Agent'    => 'Gymind WooCommerce Integration/2.0.0',
            ],
            'timeout' => 10,
        ]);

        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (isset($body['available']) && $body['available'] === false) {
                wc_add_notice(__('This organization name is already taken. Please choose a different name.', 'gymind-integration'), 'error');
            }
        }
    }

    public function save_checkout_org_name_to_order($order, $data) {
        $org_name = $this->get_org_name_from_post();
        if (!empty($org_name)) {
            $order->update_meta_data('_gymind_organization_name', $org_name);
        }
    }

    // --- Order Processing & Provisioning ---

    public function handle_order_status_change($order_id, $old_status, $new_status, $order) {
        $this->log_message("Hook fired for Order ID: $order_id. Status: '$old_status' → '$new_status'.");

        if ($new_status !== 'completed') {
            return;
        }

        if (!$order) {
            $this->log_message("Could not retrieve order object for Order ID: $order_id.");
            return;
        }

        $customer_email = $order->get_billing_email();
        $customer_name = $order->get_formatted_billing_full_name();
        if (!is_email($customer_email)) {
            $this->log_message("Invalid or missing customer email for Order ID: $order_id.");
            return;
        }

        // Get org name from our custom meta, falling back to the WooCommerce billing company field
        $organization_name = $order->get_meta('_gymind_organization_name');
        if (empty($organization_name)) {
            $organization_name = $order->get_billing_company();
        }

        $settings = get_option(self::OPTION_NAME, []);
        $api_key = $settings['apiKey'] ?? '';
        $api_url = $settings['apiUrl'] ?? '';
        $mappings = $settings['mappings'] ?? [];
        $has_api_config = !empty($api_key) && !empty($api_url);

        $product_map = [];
        foreach ($mappings as $map) {
            $pid = !empty($map['productId']) ? $map['productId'] : null;
            $plan_id = !empty($map['planId']) ? $map['planId'] : (!empty($map['organizationId']) ? $map['organizationId'] : null);
            $plan_name = !empty($map['planName']) ? $map['planName'] : (!empty($map['organizationName']) ? $map['organizationName'] : 'N/A');
            if ($pid && $plan_id) {
                $product_map[$pid] = ['plan_id' => $plan_id, 'plan_name' => $plan_name];
            }
        }

        foreach ($order->get_items() as $item_id => $item) {
            $product_id = (string) $item->get_product_id();
            $variation_id = (string) $item->get_variation_id();
            $target_id = ($variation_id && $variation_id !== '0') ? $variation_id : $product_id;

            if (!isset($product_map[$target_id])) continue;

            $plan_data = $product_map[$target_id];

            if (!$has_api_config) {
                $this->log_provisioning_attempt([
                    'order_id' => $order_id,
                    'customer_name' => $customer_name,
                    'customer_email' => $customer_email,
                    'product_id' => $target_id,
                    'product_name' => $item->get_name(),
                    'organization_id' => $plan_data['plan_id'],
                    'organization_name' => $organization_name ?: 'N/A',
                    'status' => 'failed',
                    'response_code' => null,
                    'response_message' => 'Gymind API Key or URL is not configured.',
                ]);
                continue;
            }

            $this->log_message("Provisioning $customer_email for plan {$plan_data['plan_id']}, org '$organization_name'.");
            $result = $this->send_provisioning_request($customer_email, $customer_name, $plan_data['plan_id'], $organization_name, $api_key, $api_url);
            $this->log_message("API Response: " . print_r($result, true));

            $this->log_provisioning_attempt([
                'order_id' => $order_id,
                'customer_name' => $customer_name,
                'customer_email' => $customer_email,
                'product_id' => $target_id,
                'product_name' => $item->get_name(),
                'organization_id' => $plan_data['plan_id'],
                'organization_name' => $organization_name ?: 'N/A',
                'status' => $result['status'],
                'response_code' => $result['code'],
                'response_message' => $result['message'],
            ]);
        }
    }

    private function send_provisioning_request($email, $name, $plan_id, $organization_name, $api_key, $api_url) {
        $body = [
            'email' => $email,
            'name' => $name,
            'planId' => $plan_id,
            'organizationName' => $organization_name,
        ];
        $this->log_message("Sending provisioning request: " . wp_json_encode($body));

        $response = wp_remote_post($api_url, [
            'body'    => wp_json_encode($body),
            'headers' => [
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
                'User-Agent'    => 'Gymind WooCommerce Integration/2.0.0',
            ],
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return ['status' => 'failed', 'code' => null, 'message' => $response->get_error_message()];
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        if ($response_code >= 200 && $response_code < 300) {
            return ['status' => 'success', 'code' => $response_code, 'message' => $response_body];
        } else {
            $decoded_body = json_decode($response_body, true);
            $error_message = isset($decoded_body['message']) ? $decoded_body['message'] : $response_body;
            return ['status' => 'failed', 'code' => $response_code, 'message' => $error_message];
        }
    }

    private function log_provisioning_attempt($data) {
        global $wpdb;
        $table_name = $wpdb->prefix . self::LOG_TABLE_NAME;
        $wpdb->insert($table_name, $data);
        $this->log_message("Database log entry created with status: '{$data['status']}'.");
    }

    private function log_message($message) {
        if (defined('WP_DEBUG') && WP_DEBUG === true && defined('WP_DEBUG_LOG') && WP_DEBUG_LOG === true) {
            if (is_array($message) || is_object($message)) {
                $message = print_r($message, true);
            }
            error_log('[Gymind Integration] ' . $message);
        }
    }
    
    public function get_provision_logs(WP_REST_Request $request) {
        global $wpdb;
        $table_name = $wpdb->prefix . self::LOG_TABLE_NAME;
        
        $results = $wpdb->get_results(
            "SELECT id, order_id, customer_name, customer_email, product_name, organization_name, status, created_at, response_message 
             FROM $table_name 
             ORDER BY created_at DESC 
             LIMIT 100"
        );
        return new WP_REST_Response($results, 200);
    }

    private function register_gymind_webhook($api_key) {
        $gymind_connect_url = 'https://studio.gymind.app/api/provision/connect';
        $my_webhook_url = get_rest_url(null, 'gymind/v1/cancel-subscription');

        $args = [
            'method'  => 'POST',
            'timeout' => 15,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type'  => 'application/json',
                'User-Agent'    => 'Gymind WooCommerce Integration/1.3.0',
            ],
            'body'    => json_encode(['webhookUrl' => $my_webhook_url]),
        ];

        $response = wp_remote_post($gymind_connect_url, $args);

        if (is_wp_error($response)) {
            $this->log_message('Gymind Webhook Registration Failed: ' . $response->get_error_message());
            return ['status' => 'failed', 'message' => $response->get_error_message()];
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($response_code === 200 && isset($body['success']) && $body['success']) {
            $this->log_message('Gymind Webhook Registration Successful.');
            return ['status' => 'success', 'message' => $body['message'] ?? 'Webhook registered.'];
        } else {
            $error_message = 'An unknown error occurred.';
            if (isset($body['message']) && is_string($body['message'])) {
                $error_message = $body['message'];
            }
            $this->log_message('Gymind Webhook Registration Error (' . $response_code . '): ' . $error_message);
            return ['status' => 'failed', 'message' => $error_message];
        }
    }

    public function handle_cancel_webhook(WP_REST_Request $request) {
        // 1. Authenticate
        $settings = get_option(self::OPTION_NAME, []);
        $stored_api_key = $settings['apiKey'] ?? '';

        if (empty($stored_api_key)) {
            return new WP_Error('not_configured', 'Gymind API Key is not configured in WordPress.', ['status' => 503]);
        }

        $auth_header = $request->get_header('Authorization');
        if (empty($auth_header) || !preg_match('/^Bearer\s+(.*)$/i', $auth_header, $matches)) {
            return new WP_Error('unauthorized', 'Authorization header missing or invalid.', ['status' => 401]);
        }

        $token = $matches[1];
        if (!hash_equals($stored_api_key, $token)) {
            return new WP_Error('forbidden', 'Invalid API Key.', ['status' => 403]);
        }

        // 2. Get parameters
        $params = $request->get_json_params();
        $email = isset($params['email']) ? sanitize_email($params['email']) : null;
        if (!$email) {
            return new WP_Error('bad_request', 'Email is required.', ['status' => 400]);
        }

        // 3. Find the User
        $user = get_user_by('email', $email);
        if (!$user) {
            return new WP_Error('no_user', 'User not found.', ['status' => 404]);
        }

        // 4. Find Active Subscriptions and update
        if (!function_exists('wcs_get_users_subscriptions')) {
            return new WP_Error('wcs_missing', 'WooCommerce Subscriptions plugin is not active.', ['status' => 500]);
        }

        $subscriptions = wcs_get_users_subscriptions($user->ID);
        $found_active = false;

        foreach ($subscriptions as $subscription) {
            if ($subscription->has_status(['active', 'on-hold'])) {
                // ACTION: Set to "Pending Cancellation"
                $subscription->update_status('pending-cancel', 'Cancelled via Gymind App');
                $found_active = true;
            }
        }

        if ($found_active) {
            return new WP_REST_Response(['success' => true, 'message' => 'Subscription set to cancel at end of billing period.'], 200);
        } else {
            return new WP_REST_Response(['success' => false, 'message' => 'No active subscriptions found for this user.'], 404);
        }
    }
}

// Initialize the plugin
Gymind_Integration_Plugin::get_instance();