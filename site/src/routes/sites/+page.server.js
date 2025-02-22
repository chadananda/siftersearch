import { error } from '@sveltejs/kit';

export async function load({ locals }) {
    try {
        // This will be replaced with actual DB queries
        const sites = [
            { 
                id: 1, 
                domain: 'example.com',
                paths: ['/docs/*', '/blog/*'],
                lastCrawled: '2025-02-20T10:00:00Z',
                documentCount: 156,
                enabled: true
            },
            { 
                id: 2, 
                domain: 'another-site.org',
                paths: ['/articles/*'],
                lastCrawled: '2025-02-21T15:30:00Z',
                documentCount: 83,
                enabled: false
            }
        ];

        return {
            sites,
            metadata: {
                total: sites.length,
                lastUpdated: new Date().toISOString()
            }
        };
    } catch (e) {
        console.error('Error loading sites:', e);
        throw error(500, 'Error loading sites');
    }
}

export const actions = {
    updateStatus: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const enabled = data.get('enabled') === 'true';

        try {
            // This will be replaced with actual DB update
            console.log(`Updating site ${id} enabled status to ${enabled}`);
            return { success: true };
        } catch (e) {
            console.error('Error updating site:', e);
            return { success: false, error: 'Failed to update site' };
        }
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        try {
            // This will be replaced with actual DB delete
            console.log(`Deleting site ${id}`);
            return { success: true };
        } catch (e) {
            console.error('Error deleting site:', e);
            return { success: false, error: 'Failed to delete site' };
        }
    },

    addPath: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const path = data.get('path');

        try {
            // This will be replaced with actual DB update
            console.log(`Adding path ${path} to site ${id}`);
            return { success: true };
        } catch (e) {
            console.error('Error adding path:', e);
            return { success: false, error: 'Failed to add path' };
        }
    }
};
