// src/routes/api/auth/login/+server.js
import { json, error } from '@sveltejs/kit';
import { generateJwtToken } from '$lib/api/utils';
import { createClerkClient } from '@clerk/clerk-js';

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and generate JWT token
 *     description: Validates user credentials via Clerk and returns a JWT token for API access
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Clerk session token
 *     responses:
 *       200:
 *         description: Successfully authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for API access
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [superuser, librarian, editor, subscriber, anon]
 *       401:
 *         description: Authentication failed
 *       500:
 *         description: Server error
 */
export async function POST({ request }) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      throw error(400, 'Session token is required');
    }
    
    if (!process.env.CLERK_SECRET_KEY) {
      throw error(500, 'Authentication service is not configured');
    }
    
    // Initialize Clerk client
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    
    try {
      // Verify the session token
      const session = await clerk.sessions.verifySession(token);
      
      if (!session || !session.userId) {
        throw error(401, 'Invalid session token');
      }
      
      // Get user from Clerk
      const clerkUser = await clerk.users.getUser(session.userId);
      
      // Extract role from public metadata, default to subscriber for authenticated users
      const role = clerkUser.publicMetadata?.role || 'subscriber';
      
      // Validate role is in our hierarchy
      const validRoles = ['superuser', 'librarian', 'editor', 'subscriber', 'anon'];
      const userRole = validRoles.includes(role) ? role : 'subscriber';
      
      // Create user object
      const user = {
        id: session.userId,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        name: `${clerkUser.firstName} ${clerkUser.lastName}`,
        role: userRole
      };
      
      // Generate JWT token
      const jwtToken = generateJwtToken(user, {
        additionalClaims: {
          sessionId: session.id
        },
        expiresIn: '24h' // Token expires in 24 hours
      });
      
      return json({
        token: jwtToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      console.error('Authentication error:', err);
      throw error(401, 'Authentication failed');
    }
  } catch (err) {
    console.error('Login error:', err);
    throw error(err.status || 500, err.message || 'Server error');
  }
}
