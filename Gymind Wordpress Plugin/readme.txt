=== Gymind Integration for WooCommerce ===

Integrates WooCommerce with Gymind to automatically provision users to organizations when they purchase a corresponding product.

== Description ==

This plugin connects your WooCommerce store to your Gymind Academy. When a customer completes a purchase for a product that you have mapped to a Gymind Organization, their email address is automatically sent to the Gymind API, pre-approving them for access.

This creates a seamless onboarding experience, giving customers immediate access to the digital products and communities they've paid for.

The plugin provides a modern settings page within the WordPress admin dashboard to manage your Gymind API credentials and map WooCommerce products to Gymind Organizations.

== Installation ==

This plugin contains React/TypeScript source files that must be compiled before the plugin can be used. Follow these steps carefully.

**Part 1: Build the Plugin Assets**

1.  **Prerequisites:** Make sure you have [Node.js and npm](https://nodejs.org/en/download/) installed on your computer.
2.  **Organize Files:** Create a folder structure where `react-src` is a sub-folder in your main plugin directory. Move all `.ts`/`.tsx` files and the `components`/`services` folders into a new `react-src/src` directory. Place your `logo_gym.webp` and `wp_logo.png` files inside an `assets` folder in the main plugin directory.
3.  **Install Dependencies:** Open a terminal, navigate into the `react-src` folder, and run `npm install`.
4.  **Build the Code:** From the same `react-src` directory, run `npm run build`. This will generate the required `index.js` and `index.css` files in the main plugin directory.

**Part 2: Package and Upload to WordPress**

1.  **Prepare the Files:** In your main plugin directory, rename `gymind-integration.txt` to `gymind-integration.php`.
2.  **Create ZIP File:** Create a `.zip` file containing these items from your main plugin directory:
    *   `gymind-integration.php`
    *   `readme.txt`
    *   `index.js` (created in the build step)
    *   `index.css` (created in the build step)
    *   The `assets` folder (containing your logos)
3.  **Upload:** In your WordPress dashboard, navigate to `Plugins` > `Add New` > `Upload Plugin`. Choose the zip file you just created, install, and activate it.

== Setup ==

1.  After activating the plugin, a new "Gymind" menu will appear in your WordPress admin sidebar. Click on it.
2.  On the "Gymind Integration Settings" page, enter your **Gymind Academy API Key** and verify the **Gymind API URL**. This will automatically load your available organizations.
3.  Click "Add Mapping" to create a new link between a WooCommerce product and a Gymind organization.
4.  Use the search box to find a WooCommerce product.
5.  Select the corresponding **Gymind Organization** from the dropdown menu.
6.  Add as many mappings as you need.
7.  Click "Save Changes".

The integration is now active. The plugin will monitor completed orders and send the necessary data to Gymind.

== Frequently Asked Questions ==

= Where do I find my Gymind API Key and Organizations? =

You can find your API key within your Gymind Academy administrator dashboard. The organizations will be loaded automatically into the dropdown menu on the settings page once the API key is entered.

= How can I check if the integration is working or debug an issue? =

The "Users" tab in the plugin settings shows a log of the last 100 provisioning attempts. This is the first place to check.

If an order is not appearing in the log at all, you can enable WordPress's built-in debugging feature to get a detailed, step-by-step trace of the plugin's activity.

1.  **Enable Debug Mode:** Connect to your website's files (via FTP or a file manager) and open the `wp-config.php` file, which is in your main WordPress directory.
2.  Add or edit the following lines to be `true`:
    ```
    define( 'WP_DEBUG', true );
    define( 'WP_DEBUG_LOG', true );
    ```
3.  **Trigger the Action:** Complete a test order again.
4.  **Check the Log File:** A new file will appear at `/wp-content/debug.log`. Open this file and look for lines that start with `[Gymind Integration]`. These log entries will show you exactly what the plugin is doing and where any potential issue is occurring.
5.  **Important:** Remember to set `WP_DEBUG` and `WP_DEBUG_LOG` back to `false` when you are finished debugging.