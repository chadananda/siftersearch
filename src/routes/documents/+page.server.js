import { error } from '@sveltejs/kit';

export async function load({ locals }) {
    try {
        // This will be replaced with actual DB queries
        const documents = [
            { id: 1, title: 'Introduction to SifterSearch', author: 'John Doe', dateAdded: '2025-02-20', status: 'published' },
            { id: 2, title: 'Getting Started Guide', author: 'Jane Smith', dateAdded: '2025-02-21', status: 'draft' },
            { id: 3, title: 'Advanced Search Techniques', author: 'Bob Wilson', dateAdded: '2025-02-22', status: 'published' },
        ];

        return {
            documents,
            metadata: {
                total: documents.length,
                lastUpdated: new Date().toISOString()
            }
        };
    } catch (e) {
        console.error('Error loading documents:', e);
        throw error(500, 'Error loading documents');
    }
}

export const actions = {
    updateStatus: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const status = data.get('status');

        try {
            // This will be replaced with actual DB update
            console.log(`Updating document ${id} status to ${status}`);
            return { success: true };
        } catch (e) {
            console.error('Error updating document:', e);
            return { success: false, error: 'Failed to update document' };
        }
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        try {
            // This will be replaced with actual DB delete
            console.log(`Deleting document ${id}`);
            return { success: true };
        } catch (e) {
            console.error('Error deleting document:', e);
            return { success: false, error: 'Failed to delete document' };
        }
    }
};
