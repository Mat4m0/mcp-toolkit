import { desc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default eventHandler(async (event) => {
  const { user } = await requireUser(event)

  const userTodos = await db
    .select()
    .from(schema.todos)
    .where(eq(schema.todos.userId, user.id))
    .orderBy(desc(schema.todos.createdAt))

  return userTodos
})
