import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'
import db from "@repo/db/client"


export async function POST(req: Request) {
    // You can find this in the Clerk Dashboard -> Webhooks -> choose the endpoint
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
    if (!WEBHOOK_SECRET) {
        throw new Error('Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
    }
    console.log("----------------------------------------")

    // Get the headers
    const headerPayload = headers()
    const svix_id = headerPayload.get('svix-id')
    const svix_timestamp = headerPayload.get('svix-timestamp')
    const svix_signature = headerPayload.get('svix-signature')

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response('Error occured -- no svix headers', {
            status: 400,
        })
    }

    // Get the body
    const payload = await req.json()
    const body = JSON.stringify(payload)

    // Create a new Svix instance with your secret.
    const wh = new Webhook(WEBHOOK_SECRET)

    let evt: WebhookEvent

    // Verify the payload with the headers
    try {
        evt = wh.verify(body, {
            'svix-id': svix_id,
            'svix-timestamp': svix_timestamp,
            'svix-signature': svix_signature,
        }) as WebhookEvent
    } catch (err) {
        console.error('Error verifying webhook:', err)
        return new Response('Error occured', {
            status: 400,
        })
    }

    // Do something with the payload
    // const { id } = evt.data
    const eventType = evt.type

    console.log(eventType)
    if (eventType === "user.created") {

        const { email_addresses, id, phone_numbers } = evt.data
        if (email_addresses.length < 1 || phone_numbers.length < 1) {
            return new Response('', { status: 200 })
        }
        try {
            const res = await db.$transaction(async (tx) => {
                const res = await tx.user.create({
                    data: {
                        email: email_addresses[0].email_address,
                        number: phone_numbers[0].phone_number,
                        clerkId: id,
                        verified: true
                    }
                });

                await tx.balance.create({
                    data: {
                        userId: res.id,
                        amount: 0,
                        locked: 0
                    }
                })

                await clerkClient.users.updateUserMetadata(id, {
                    unsafeMetadata: {
                        id: res?.id,
                    },
                })
            })


        } catch (err) {
            await clerkClient.users.deleteUser(id);
            return Response.json({ message: "User Already Exists" });
        }
    }



    return new Response('', { status: 200 })
}