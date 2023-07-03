export async load(url) {
  const objLoader = new OBJLoader()
  async function doLoad() {
    return new Promise((resolve, reject) => {
      objLoader.load(
        url,
        (obj) => {
          resolve(obj)
        },
        () => {console.log('loading...')},
        (err) => {
          reject(err)
        },
      )
    })
  }
}
}
