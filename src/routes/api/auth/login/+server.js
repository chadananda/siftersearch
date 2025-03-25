// src/routes/api/auth/login/+server.js
import { json, error } from '@sveltejs/kit';
import { generateJwtToken } from '$lib/api/utils';

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and generate JWT token
 *     description: Validates user credentials and returns a JWT token for API access
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 description: User email
 *               password:
 *                 type: string
 *                 description: User password
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
    const { email, password } = await request.json();
    
    if (!email || !password) {
      throw error(400, 'Email and password are required');
    }
    
    // TO DO: Implement authentication logic here
    
    // Create user object
    const user = {
      id: '1', // Replace with actual user ID
      email,
      name: 'John Doe', // Replace with actual user name
      role: 'subscriber' // Replace with actual user role
    };
    
    // Generate JWT token
    const jwtToken = generateJwtToken(user, {
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
    console.error('Login error:', err);
    throw error(err.status || 500, err.message || 'Server error');
  }
}
