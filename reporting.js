const client = require('twilio')(
  process.env.ACCOUNT_SID,
  process.env.AUTH_TOKEN
)

const directory = require('./phones')

const go = async () => {
  const calls = await client.calls.list()
  console.log(`Got ${calls.length} calls`)
  const byPhone = {}

  calls.forEach(call => {
    const number = call.forwardedFrom

    if (!byPhone[number]) {
      byPhone[number] = {
        count: 0,
        price: 0
      }
    }

    byPhone[number] = {
      count: byPhone[number].count + 1,
      price: byPhone[number].price + -1 * call.price
    }
  })

  const output = Object.keys(byPhone)
    .filter(
      number => number && number != '' && number != 'null' && directory[number]
    )
    .map(
      number =>
        `${byPhone[number].count} calls for ${directory[number].callTag.split(
          ':'
        )[2]}: cost ${byPhone[number].price}`
    )
    .join('\n')

  console.log(output)
}

go()
