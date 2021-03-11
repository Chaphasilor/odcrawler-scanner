const tape = require('tape')
const _test = require('tape-promise').default
const test = _test(tape) // decorate tape

const util = require(`./util`)

test(`url extraction`, async (t) => {

  const testData = [
    {
      input: `Someone's FLV-&gt;MP4 conversion directory: [http://212.224.80.123:8080/vod/](http://212.224.80.123:8080/vod/)`,
      output: [
        `http://212.224.80.123:8080/vod/`,
      ],
    },
    {
      input: `last [link](https://modland.com/incoming/delivery%20bay/various/)`,
      output: [
        `https://modland.com/incoming/delivery%20bay/various/`,
      ],
    },
    {
      input: `http://www.web.pdx.edu/~mcclured/The%20Boys/

http://www.arilou.org/songs/`,
      output: [
        `http://www.web.pdx.edu/~mcclured/The%20Boys/`,
        `http://www.arilou.org/songs/`,
      ],
    },
    {
      input: `http://cassidylou.com/wp-content/uploads/`,
      output: [
        `http://cassidylou.com/wp-content/uploads/`,
      ],
    },
    {
      input: `http://178.32.222.201/  
http://cdn1.moviehaat.net:8888/EnglishTVSerials/Bull/

[test](https://www.ifp.uni.wroc.pl/data/files/)`,
      output: [
        `http://178.32.222.201/`,
        `http://cdn1.moviehaat.net:8888/EnglishTVSerials/Bull/`,
        `https://www.ifp.uni.wroc.pl/data/files/`,
      ],
    },
  ]

  for (let data of testData) {

    let actualOutput = util.urlsFromText(data.input)

    t.deepEqual(actualOutput, data.output, `find all urls`)
    
  }
  
  
})