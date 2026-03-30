import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default eventHandler(async (event) => {
  const { user } = await requireUser(event)
  const id = parseInt(getRouterParam(event, 'id') as string)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid todo ID',
    })
  }

  const [existingTodo] = await db
    .select()
    .from(schema.todos)
    .where(and(eq(schema.todos.id, id), eq(schema.todos.userId, user.id)))
    .limit(1)

  if (!existingTodo) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Todo not found or access denied',
    })
  }

  const updatedTodo = await db
    .update(schema.todos)
    .set({
      done: !existingTodo.done,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.todos.id, id),
        eq(schema.todos.userId, user.id),
      ),
    )
    .returning()

  return updatedTodo[0]
})
