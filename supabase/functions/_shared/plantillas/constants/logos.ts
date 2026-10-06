// supabase/functions/_shared/plantillas/constants/logos.ts
//
// ARCHIVO GENERADO — no editar a mano. El base64 de abajo es un derivado de `public/*.png`,
// no el archivo original: no sirve de nada corregirlo acá.
//
// La receta, entera, porque el script que la aplica no está en el repo y sin esto el próximo
// cambio de logo no es reproducible. Sobre cada PNG de `public/`:
//
//   1. Redimensionar al ancho que dice cada constante más abajo, que es el DOBLE del `anchoCss`.
//      Los clientes de correo no entienden `srcset`: mandar el doble y limitarlo por atributo
//      `width` es la única forma de que no se vea borroso en pantallas HiDPI.
//   2. Aplanar sobre blanco (`#ffffff`, que es `COLORES.tarjeta` de `layout.ts`). Los tres PNG
//      de origen son RGBA, y Outlook pinta el canal alfa de negro en algunos modos de
//      compatibilidad: sin aplanar, el logo sale sobre un rectángulo negro.
//   3. Guardar como PNG con `optimize` y codificar en base64 sin el prefijo `data:`.
//
// QUÉ VARIANTE VA EN CADA LUGAR, que no es intercambiable. Medido con el promedio RGB de los
// píxeles opacos de cada archivo:
//
//   public/logo.png         tinta (8, 79, 117)     navy          -> encabezado
//   public/logo-claro.png   tinta (22, 83, 122)    navy          -> pie
//   public/logo-oscuro.png  tinta (196, 224, 225)  casi blanca   -> NO USAR acá
//
// El pie usa `logo-claro.png` y no `logo-oscuro.png` aunque el nombre sugiera lo contrario: el
// oscuro es la versión PARA fondo oscuro, y en la app aparece sólo dentro de `dark:block` o
// pasado por `brightness-0 invert`. El correo no tiene ninguno de los dos, así que sobre la
// tarjeta blanca saldría invisible.
//
// Los logos viajan como adjunto inline (`cid:`) y no como `<img src="https://...">` porque
// Outlook bloquea las imágenes remotas por defecto: con URL el encabezado del correo sale como
// un recuadro vacio hasta que el lector hace clic en "Descargar imagenes". Incrustado se ve
// siempre, y de paso el correo deja de depender de que el dominio del front siga en pie.
//
// Resumen de lo generado:
//   logo.png -> 240x181, 19 KB crudos
//   logo-claro.png -> 280x60, 8 KB crudos

export type LogoCorreo = {
  /** Identificador que referencia el `<img src="cid:...">` del HTML. */
  cid: string;
  /** Nombre del adjunto. Graph exige extensión. */
  nombre: string;
  alt: string;
  /** Ancho de presentación. El archivo mide el doble, por pantallas HiDPI. */
  anchoCss: number;
  altoCss: number;
  /** PNG en base64, sin el prefijo `data:`. */
  base64: string;
};


/** EMS. Origen: `public/logo.png`, 240x181. */
export const LOGO_EMS: LogoCorreo = {
  cid: "logo-ems",
  nombre: "logo-ems.png",
  alt: "EMS",
  anchoCss: 120,
  altoCss: 90,
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAPAAAAC1CAIAAADuouUaAABPiUlEQVR42u19d4BdVbX+WmufeyeT3kMaICGBUEOHCFIfIiDg" +
    "A1HxAU9QERUQH7bn41mxFwQLIjYsNB+KCCqgAtIxAQGBCKEkkISQ3uees9f3+2OfXc6dSQyZmUzgd/ebJ8lk5t57zll77VW+" +
    "9X0MgFqrtV4rS1q3oLVaBt1ardUy6NZqrZZBt1ZrtQy6tVoG3Vqt1TLo1mqtlkG3Vmu1DLq1Wqtl0K3VMujWaq2WQbdWa7UM" +
    "urVaq2XQrdVaLYNurZZBt1ZrtQy6tVqrZdCt1Votg26t1moZdGu1DLq1Wqtl0K3VWi2Dbq3Wahl0a7VWp5X16qs7FhtVMKff" +
    "JPdXZub0H1qrtbq9uJeYkwCowhj5lz8GoPcs21p1F+he371XutnCPzX9a9PPuB/b8K+7b4qwSPNVq0JV3StU7j7zv7xF3Vmd" +
    "3zd82o1/X1UFKL2NG/P0O/+k+6b7X5HeeuK9YtCq6h6qqs6fv+C55+fMX/DSkqVLO9auM8YMGjRwxPDh48aP3WabrYcNHdr0" +
    "K/+/rS6f/Zbwys4lMVMvPZdeuvAeNuhglwsWvHTf/Q8+9NDD8xe8JCwsjHIRETERgFqtPnnK9gcdeMAe03YTkZ69QvdqX/3e" +
    "tU89Mz+rmSIviIiNwEJZCZQZIyIAKSzAAIwR1fJgUSgpsRCzMBGgUGJD1irKb5MRAWDVEoSJ2LBanPzmg/7tDXuqQoSdjxTh" +
    "q37zl9v++nB7e5tVJQs2zMSNwu4+dZsPvut4a7XH/bR7zftmPvnDa27JhKDEQsKmsMXadR2TXzfhwg+dsmHX7j4/ET0396WZ" +
    "j81+8um58xcuaeQ5AVaVSJiUmIrCncOwFkQgoswYI2JVWRgKq0qAMZJlhlmY6aB9dz35zQf1+BPveYN21rx06bLf3PC7+x/4" +
    "m6q11gLIsjJSd7eVQADcMZZlGYjGjR93zJuO3GfvPXtw47rXmXbE+x556kWgYO5sMUwEIiZ2f3Z/IAL8P/m/uG8QE4jK/0en" +
    "A5WIFFz7+PtO+OInzigKm2WGiNwfTvnAl66+6T5CI3kxJmIC//LSD7/9uEPCz/fUg2Dml15euu+bPzR3wVKClm9ITCCI2X78" +
    "iKfu/tGGNwOAX/7m9p9cd9u9M55Ys65RcavMRC5+cDejDMHY3zt3meRvm/tHJm9pLAfvt8svv/3RsaOH9/jJnPVg8iciMx96" +
    "+Be/uHb1mjWNRiPLnAuEtbaMmJgBYhc7MitUAQAvzH3hB1f85G8PzjjlnW8bMnhwD17k4MH9jWjdmNyCgwUneSkIpSF7C/X7" +
    "iUGoPBZ2z849GKbSrsHenLOaaRSo1bq4pf3b2zKxtUyKQonYxePEUPAHL7xs/z2nbjthTOoUu/ks3OW964Jvzp2/uL0uRUHM" +
    "BDARiSELDB0yYMPWPPPRpz/0qe//dcaTTEqwNZMxw4fRpQmT35alSwQxu/sZftDfQTAxOycgosx0xwOPn/y+i/50zZeznj6a" +
    "sh66gxCRG3/3+xt/d7MzR2PEXWGZSSCxGP9HZla17sestQ8/8ticF+e9/33vnjhhfE/ZtLVqrebgQrW8xal/Lm0XiYlS8jNc" +
    "Phum0pBR8ePJBRGzckHWsmoXJx5Ui8IyqFCbfAxkki1ZtvL087522zVfFBaAun86WatZZr7yvev+cOfD/WrcyHNFdI4GZMuY" +
    "Yb3WfP3v7z7t/K+vXttRN0RgBRdaEBgEZvijjQns/YK/C/G/7sdKc3b3y7l2a5VZ24y5e8asa357x6knHt6zp5P0hEGTiFz5" +
    "86tu/v0tzg2olk8+WErc0/GXfNbMTMzMUGsXLXz5G9+85NlnnxMRXc9Nf2URlZA7EggVay5tF8G5gOA+FEpLjccosTtM4Y/S" +
    "8DMEkDIrsZL/7S4NMlgUgwFSMIEBya3WDf4648nPfOMXxoi12iPWPOORpz71tZ/XWHNrFanJARTDgi6t+Xe33f/W931h7dq1" +
    "dUOFtVYLVQKEiAgCFWhppt5YyxvHBCJweG3460bpJ8r7Qy4jARH9+vd3b3zlZDMZtKqK8M1/uOWee+8vbAEokyvKEOAO5Fju" +
    "4VB7Zi5DV2ZjXA1H3F9XrVz97e9ctmjRYheudPfyWJjY3WZQxaIzI8ZIJiYTUzOZETFiamJqwplIZqRmODOcGTEixkjNSM1I" +
    "ZkxmskwkE84M14xkUn7Vai7v4abCXHDnpSmX+6WMY3KLGuPL37vu9nsfyTLTHZt222nlqrWnfeir6xoNV6YIwbMP3ZlYO4c2" +
    "7jnOe2nxf37464Aa5rxQgAEuPztgRGuG65nURGri7o9kIsaYmjGZ+yrvp8mMZIaz8se4JqZmpFbeKyNsjNCL819+RQXEXjdo" +
    "Fxg88eSs//vVb9RaqAJaejMQVzNOTtwC+//j0tCo9NJQYlq1as3lP/hRURSxLLLJHpoZpMGe3TZikBAKq4VSbrVhkVvNFYUi" +
    "V20ocotCkVsqLDUsctXComGRu5+0Wqg2FI2CGpYalnPLDctr1trCckdHo6t95cxC2B3DiJGX2/VW6fTzv75w0TKRroOWjXTP" +
    "InLWx7/1+NMv1oyogkgqARRzU3xQ7Xbxf3/hR0uWra4bLqy6PYfydNPMiFU0LBqFu3BuWCosckVukSuVNw2UKxpWc0VuOVc0" +
    "lHJFrsiVcqUO5YbldbktVJavXENbTqfQJbzr1q278spfsrC1ZSRd3oMQqIZnxxRqA+HMjhFrmZgJiECY++L8W27909FvemNT" +
    "l/EVbzm4bQNihJNShKF0xtuO3HmHba3V8sDw7QZXcmrkhatAMZMkfR+FOoNzNTtiEhYQoCTCeWEP3HdnIgrpXbkhAY5/LV/N" +
    "H9lcFJoJz52/6N0fufi3P/60tVbkFceULhK97Gc3XXXj3W0Z8iKc8xQqpeyCHh/vpUU6Y+SxJ5/7xQ23Gy4K5dT/MEFYCout" +
    "Rg075vD9d9x+YmaMi8KN6zZA3aa1qi4fDdvSGCPMIFir7hlbtcLCzHlRTBw7cosyaBLhP/359qVLlwuLhRURLkNT4vJQ9fUu" +
    "LuOn4HDZ1w2aUkWXexV5ftPNtx6w/35Dhw7pTiEvEwn+iEvfyMxkQWe8/ajpe0/tpXZJU0ZrMkNptS6klAwGAVyorRn53Z8e" +
    "vPRHN5xzxvGvNE9SRZaZWbNf+PgXf2LEFlpmBT7iI1fkcNadpLPpSWt+/Ye7C6U2I4UqC5XBBoiFCssnvHH/733xnDGjhtFr" +
    "EsvheryrV6+59ba/FDanUKYJ6VbY4a5a6UAdaRpfFniDg/Z5F1xVX4qi+P0fbjvlHSe5qmp3QioGQRlM3m8yMZavWF0Utseb" +
    "GiKy/upbEs66RFN9DESsCiP00c9fMX3vnfbabfLGV/FcYNbI7Wkf+sqK1WsyI9aqc8ic5H9cumVmglbL6G773fXAP5gUYNUY" +
    "nIhAQVO2G3vVdz/RVq/ledGDOVxvdP6zTY6ejTEzZj60Zs0al72KsAKuFMbRNyeFG1/4iK4ZobPBsd6Dsr5gbXHvA/e/5YRj" +
    "2tvbN9lJq1UfPlM8OoiYSIRdDteraApKezXs0QzVeMuZmiXOhDsKe9p5X33gpkva+7Vt5FW7ysYFn//Bg488WzNUWPUxhiu1" +
    "UXJ3fXclyUzcs+to5LOfn0dQC1cmL4szRqRh6f2nv9lZc5dVdnoNwEfdnp7xt5lUvU8+r2d3tMV+RfhL4iNjqshJMQ/RrNet" +
    "WTfrn083gYQ2revDwYY4+snNvsCV6BVlY6L8JxSWMsNPzH7xgs9dLsIbU/Fw1nzjrfdf/KPf1gwKq5UCOSouhdO3ra4VK9cs" +
    "W7k6OHSwa5WrEph0950mlQkSvRbx0M5zrFix8ulnnivygkNVTqS8Zl/LBUBdmSIqhemKA3FHtv+DeeLxWZRE3puQFLoKSlp7" +
    "dd/TzSjQiNBuiG300gVImSm7Y0tVNTP4/i/+8LvbHviXVTwXlry4YPF7Pvotw664y869MkMEzFpGzbEhDRCh08taVfdNlFkg" +
    "4BrmxASqZRnRaxfg7/zlvPnzGx3rPMREfIefIvjI3XQfubGPMcrGqPfY8A3lxIEzE6uqqj47Zw4RmU3tCSsAkhASlu8V0rPN" +
    "Z9FKcNYbIq2wr0LvscwWATDjPR/55tx5L5uy+rYh5O2Z//XNhUuWC7Mq4HM+JrKWSgv3V7yBLdyvrV6v1/xZi1DjFCZi+cc/" +
    "n2PmHml1bZkGTUQ0f978rFYzmfGvUYEFg+JDin0q74vCwZ/WlLjZpQHQZUuXNfKceBNBVIbZJ/dMxMLsPq3zVEVhu/O18U0Q" +
    "dV1if1D4Cj2M0IRxIxRg1rIWRKzKRnjB4uWnnvuVorDrK8a7dPYLl179x7serhuyqv7QAwsUNG70iAED2pNWdKixMHUKHgYP" +
    "7D9m9AhiIREiAYRIiNgCzPjWFb9u5HmtluV5sWk3arNthk2KipiIaMmSZe7BlGVcRqWu3GTkzjEDlFT3mdN/V8RwgEo/Cqxd" +
    "u3r16jXdb5A6s1aEijAPGTwgy0xbWy3LzKZ9vdJs0ldxXE8exnCh8pX/fvcb9t1VIcaEkwSFRVtGdz74xEWXXNVlS9yFzn+9" +
    "/7FPff1ndUGhGgrbxhCRDB044AdfPb9fWx2A691zWi9NbiYzW6siPHX7CSLimvMlXAGiSsL0j6dfeNvZX1ywcGmtlm3ajXKx" +
    "aFHYTW4b9WaVA0REjbyRTjEwpQkPe4RV+c0IavPmzbEDDI8ACi/i2uMERSMv8jzfZFhp6dkRgAeuaKVC/MOr/vDAQ7Pcs2Qm" +
    "Y4wq8qJwns9Fja5KlWUiwi4YcP2jLBNVvG7imBOOmr6xHoCb97gr847bavhPL75g6iFnWc1ZoFr+SKEwgi98+5qjDt17vz12" +
    "TMuLrsW9fMXqd3/kYi0hKSB1EQIE3AB/90vnvH6fqatWrQNgDFuNR2HnpNDdnqMO2fvqG+8ygpCzMDGIFZQJbrj1/vtmPHHs" +
    "EfvuMGliv351azVUY62qKhSAwsEY4AGjmTGDB/XfdsKYya8bv82E0a647pplvTTWsOnBfpYZQKElcicA18pIMGCSUGmjpK0y" +
    "7y0jegkRoAXX2jOSdScjAYhY3UFU7hZ2bV78+NpbiY0P91E5LYgTRC+oEn/7jyfZtB0nnnDU9I3ZaWVB06e/nJQ8Vq1et+3E" +
    "MRd97NT/+vyP65mAlJSIWJWEtaF66jlfuf+mS4YM6h/eyLnn937s4n8+P7/NUOGTOQKJSMPSKccf+PbjDn5mzvx6TdZ1lB4X" +
    "IVvn5iTboZ/fctTrL/zyT158eUkmorAI8BdmBRvhlxYv++G1t6HS/016DxTeh6shJBgY0L8+Zbutjzx4r1OOP3jXHbdtmiHY" +
    "IkKOQQMHUVIDS4tjPgjpIvbgqqFTgDbEf08aLyJt/er9+vXrZv0+idXZwYNAVDNcN1oXrWeoC9cNagb1DHVDNaFMqFZ+cSZc" +
    "E64J1w3cV/+6yUQHDWh7RVVOZ9EctwqDqF7LAHz4vSceedDuuWXjBhG4jLxrRp6a89L7//tSkTLwcE3EH19zy7U331s3KKwF" +
    "McBEbAznFjtuN/ayL53nQkGUGwlM2EChkplVMXhQ/4998O2gTEQ8ajCAEWGtCnMmXA93hjljf38M1wzXM9QN14QyQzVBXagm" +
    "aDMwhlavXvvQP5768nd/tc/R555+/tdemL9oI+uSm8Og3Z0ZNnyY+sAYoXyBAKTrNBpSiUdIEUpq4a4yp+1yJiMyeNCgfv3a" +
    "utOM8gg/3/gGoYRuIrdoFMgLFKqNAlY1t5pbFKpW1f+vLb+sFqq5aq5aWM0L3fjHIRzi2BQKUDoCZ09XfPVDY4YPVkBM6eCY" +
    "YGHrBtfceNePr7kly0xe2CwzTz0774KLfpiJmwDmErkvIKZalv3oGxcMGtjuPIoigepS7AR09owuUj/7tGOPOnhaQ7ley0Bg" +
    "Uk7KUgqyVguLwqIId8Zaa7WwWsK5FFZRWFiLwtrCamFV1bKwEVM3WtjGz66//fUnfPi+mU/0CGK2JwyamYgmjB+nVlULQKO1" +
    "llh49g+vbGmj2liJR3ws4VUHLsjN/JmxY7dyBaNNC7k4iRnSj58iKhA6whBAmj4Ri/9J8cXFOK7AG3mvikJLIHAaPzvMFEBE" +
    "hbUTx4368Tc/bJWEuAxSiEugBev5n778n8+8aITXrus47byvLF22kiCqYYdwJmKVP3vBfxyw11SHrLJq1brPXHpc9t2BLhMz" +
    "l0tc/Z1PHLLfzh0Fi5jMGBYQqwi46bRDCMuS1lmyc8pciFghBIGytZoXAHFNdO78l4885ZN33v/oBuqSmxs+OmbM6NGjRxkx" +
    "cVgM5cS7xoYKUv4NZ6wujoMPSkOo6msAftYHRMzbbz+pmxeImIZS2EQgMFMmbIxkHhVdhhZGjLARdodpJmKkhPZmIjUH+TXG" +
    "ZMZsROfMXYrJxEFZmUO+5XosCNi9orBHHbL3ee86rqGcGQmOFQTDvHz1mjMv+IaI/M9Xrrzv70/XDKWFMDHSUDr0gJ0/evbJ" +
    "1mr8YCGvKRuGtAEuAvftwYP633zlZz942tHWUsOSWhjJMhEjXDMiwsawMWxExN0Eh3t233SIZ+PQ5MYY5jLFDA4EAOcWmeGV" +
    "a9a+85wvLV66grl7neAe8dDWapZl06btZjJjxLiR13irQJ2POlDsqlDFuGLDO32XvChU7S47T+1OzU44xvdI54MAq3AY6BQG" +
    "3bBouG9a5KAc1CjY4X09CJgbBa1tWGtl9Zp1G1sONyZMJcWqfLU05M7fL37ijGk7bp0XnInDXYJABbRm6O4HHz/hjM9876c3" +
    "ZmytqgOCEquwQu2Y4YN/9LX/CgNATYlLrLWUhXmsFz4O9GurX/K5s/9y7ZffesyBgwcNKiw3rBSWGxbWInfhhMKFE4XVhsOI" +
    "W1irudU8RG6WrCIzzKxcTlmUaJ7Coq0mL760/AuXXuMirj6ucrj8dPr++9526588mojET1Y33c8AxgVzWZfixPQRqnzOtNXN" +
    "dInJpu44Zasxo7sDH9Vy4DlUOAhEIqSQQ/fbddK2YxUQFpCyQ9+72FNIQWohQmUnJpSPDbvY2Sp2mjLxFRU6HVkCE7O4LnW1" +
    "ZM9MhPZ+9Z9efMH0E/6ro9EhIC3LBVBVMXTDbQ8wWQ7FNwYBIqZQvuJr528zYbSr7nn7iN5D43AjQOza2huwaYAO3n/Xg/ff" +
    "9YX5i+5/aNZTz774wvxFS5etXNfR4afKHQSa1E/FMAmRGsncPc+y2oqVax578pkXX17GZTgSAhcQU1FYIb7iqps/8r6Ttho9" +
    "rKem/bNNnwQBJkwYv8OUKf98ejYRKzQFxVQSwwjwJ8eaUzY6EsxZmTeW5CbOtPWYo4/sJrEBiEASUO7wu1GVPnneOw4/cBr1" +
    "BAZyI0J55tAsIkBZQnkSlcysKOxuU193yWfOOvOjl9aNUbXxzANqhgrLsQQBzow0lM965xuPOXzfJhR1kmWHEksJw/+XV8RM" +
    "1iozTxg7ckI3YPhLlq385g9+fdGlV4mAAS0HukqYjRFesbrjT3c99M5/P8zVIvsyhnbb/8STTnDxYAnuLydJmSonKwJgmsIo" +
    "FFemwF1RFlDX48iy2rTdd50yeftugrxKvgKXBbKbJipNqLBaFLbRKNxkePhKG7bpX5t6ua+o9W39sLfPByl0kqS6H7LMFIU9" +
    "4+1vfOvR0xvKNTFIxgEKq0kxm0W4YbHXztt981NndQZ2O2iHh9sx4vQKbUz0b4yIsKqGi32lX6oYPnTQ5z5y2mVfPNeqkAh7" +
    "y2AfVjPzXQ8+1oOjstIdJLuqbrvN1kccdkiW1TjkuBXwQAXa7sNmVNPhEtSv/gmoar2t9va3ndhTcVUkkPF0JwAyI64r2/SV" +
    "NmzTvzb1cl9R67viiJmQ7OfO29WZ0eVfOW/S+FENSyLiB04q2Cb3AgPb+135rY+092tbHz9g0g8oBxqZhVg2/imb9dyof/nl" +
    "LqQo7Hvf+aa9dplUKLGYyqASE6BPPTcvHVrryyFZV1B7ywlv3mabiW7UG0ngUU3zEE4zoOycBXR/IANkFmYRY975jpNHDB/e" +
    "rVmVEpwk1FT+DmC3zYceJSPix/jjoAPWA8x2BGVDBw+44uvnO4CH+BpR2mg0Ihbmm58+a6fJWxeF7WwQImyMKMAMYfUnlavi" +
    "baaLLztKwIH77EJkTNqk9EflsuUrQxDb9wbNzFmWnfXeM0YMH8HMYkzFjJmSRiuauyyROgpwe5TJ1LITjj9mv333djPM1F0g" +
    "chr7QJLRsM0JhlQForMsZ1bKG9FVgu+C6UMO2O3zHzktVzbih7dZhZSIasK50snHTH/3O45a3wBiBBqWwBqEJ9DbCKHOa9SI" +
    "IWX9njXFpjOxal+X7To76WFDh55//gdGjhrFIq4P5fk3fBu8GlSU+ZGDUaMcD1YFs3nL8ccefdSR1toemYwyDmsTQOvp8Mhm" +
    "BERzhPeDGXG+b/2xo6vifeR9Jx209w6NgowYES3DbiO5YptxI75z0Qcdn0aXG5mJ3EZwYyuIQEZsZlpuZp6/cAmFuJkoTdL7" +
    "tdWaqIr7mDnJBdOjRo786AXn7bzT1MSGPAsFSENPJQXcudiDxRXpBw0Z/N53n37UkYe7gcWeco5EEAKzxg4LwL6it3mWLWFY" +
    "ECkT3zChtj7n5DyCCP/kGxeMHDpQoSzGNfKJqF7LfnbJR0cMG+RKnBveSlDXBGWEQstmu3CrzFwU9ra/ziAUNl4tPBSNx44e" +
    "3oMRoPRUqARg6JAh537wfae8461Dhw01WWZV3QAmlc9GXKYgIuSokphBMJlhMXvuOe3CT3xk33326lk6yrxQrm4jAjuGNii6" +
    "XGEYZGNW+sPhz10iSsp6g4MRwUE1CBtsnzv4znbbjL38qx9SSM1kmcnq9Xqh8r8fOuXAfXYuig2dY77FL0lCnvZY1jsF01Or" +
    "5Dkx8tmLfznrmfmZsKqi5MhzNVwwy9TJ2/RgBJj14LHi9tkbDnr9tGm7/fWv99x1932LFi8WY4DCuUctx/bJ27fUuLbLzjsd" +
    "eugbdpwyuTdoz4XF8ytwZGd0EyziEgCzaaXlLn94fb8oImGMsYzAwBvjLF0wfcIbp5/5tn+74rq/MJggh+y3w8fef/K/JGBg" +
    "ZnfBiJ0Az3+LTa+pvyL3/PRz87522a9+ePUfs0ysFhVkuLsfsAfsNbUH3zrr6WiJVHXwoEHHHP3GfzvisKdnP/P4E08++9zz" +
    "S5cuXbVqTV5YZhrQv33IoMHjJ4ybPHn7HaZsP2rkiJSQl3qU8NxkUu1dssOaCNEH/vvS0SOHloyLjt7cCKDqeM7BLCye+0YR" +
    "4dBxPlGhUGYRIVViUlUaM3r41d/9xID+/dKgUEorFoL6l2mi2ttgGgB867Nn77bTdh2NAkTvPOFg9831GwGXuPvyPkisW5b8" +
    "KLbL2/WBT357xqNPZ4ashWpZSgORhJ2nkWfCb04lclQkKPm/PbHrypVrZj+/YF1eZBmrFuxhri4KNSIKbDdx9KHTdy9P8i1T" +
    "NKikxVdbr9d2mrrDTlN3cJt1zZo1eZGLmPZ+bW1tbZ3ZeHsjhguTzBQpMMW5xtlzFjwz9yVX4/fQHY9hQqXZmULayTt8z7KL" +
    "pNHJTDKg/YVGXgzootgSGBs8EM2VLf5VwcFZbf/2tnPeddwr0nMAwuR2bHC5HSrrqUPf87cnHn7yeULBSVmEIyk0wtgtSgiq" +
    "xil2dNkk1iwzCiXm5LOUkZBV+ej7T+7f3taDdD9Z72S1ZIwJgZQjcxk0aGBnKRo3sdMrWhs+BAKQjjGGp1QzjiVMPP1YAA8x" +
    "SLkMCShw7kcib2+gQoEsVoiUIUo6eOCAzkGIn5EiECTuEgfSwEYeOKExaYxszB1zZxGXxT4G3LgguiTmcC/Y3q/NCDIxZSkt" +
    "vg3HzlRJcu5AMuJ3f6jbiK9IupyfrWrg1XNwHgJlRnLLh+w39V0nH9mzoytZrxZrKppRjkU+6iDJZikYVZqE/nMwQNa6R6BJ" +
    "D74s3HrwDwmpozLzw2Jln5E9EM4xQLI7wdmqbaaILkOpsgHtprvZ2wA2nkNnfeH+htmtAvcaSB1JpSssrO9Ni0LVkhLZ8mRj" +
    "ap5Dc/dI2SEFNeEBKA8NS0wgIUUYvgHY88OBWTIjHZZ2nTLh2u9f6C6qBz2abLZKZOSj2ZwFYB8GAqwqrtTgvkJ+Ut5uOKYw" +
    "ZiYWiLgzldMhhJKLoNSTCOx8jGRsTFFhsPFZaJxXibJJDO65lu8GhnNdzCrksR1VauMKbtv4KTEBCbhTpzecWBG9UNL0kSe4" +
    "YXanXokuZAU7hKMRk4kprHZYPmCPHX7/i4tGDh/cI6IFm094s8+XCIthIwQ2XG5gxKkaxKFGj3Pw/ym7l8yAMe7ZSUoyKQEk" +
    "FIsWIKNMaGKOi1ifjCXn0MMzwujlmrAYzlSEWX131hhWls7HY9h4Rsgwk2QEYuNhke5cjYmsE6PgBKiSDO0LEYgzl5cIQCBb" +
    "WLhEe8zIIWefduzH3v/Wfm313piTfY0b9KpV6xRZR15Up9IpSWWCbhCnyOE07vbQ5fTYJVuFOnseymzF6rWdD/S1HbmFsR25" +
    "zyZBzLmCOOtoNHrp2hVYs7Yo8wAWF+TkChKzdm1Hl7+yfOUaC2MLSywR/FJu2DDQL0ldG6lJs58qj0ynJayKhg8ZvPMO2x57" +
    "xL6nnniY66T0kjIlA3gNG/Qd9z06f+HSej1zjfeygM8cxlicIIYrckUMfMkdwY64GwTxfbuisERUr9fUqpYkO+xV3lhV29vb" +
    "jjp4r3o9S8sRDz02+8nZLwTFJxCcmGpe2Dfst/O4MSN6Q6Nx1Zp1t9wx020Y188SZoVaq2NGDjt0+m6df/H2ex9dsGipcaxi" +
    "RFkmTJwXRWAvZ48DYYIqLGC8QJRVG3y9ESnclHhm6vXaqOGDX7f1VmNGDk2UBl5VSrKt1VrrK9RsZImmZdC0Aa3vLu/ghp1i" +
    "07++IqXrziXVoLnd+V167wG78Z/1SZp3WffdwO3qMonc+HvSey655aFb6zVdBmjdgtZqGXRrtVbLoFurtVoG3Vqt1TLo1moZ" +
    "dGu11mtiZZulot6sjfcqXbyZh0sjER9eA6a2ee5eL9ahrQIEw8L8mvIBNiBCe/O6XpN3D4AFmFh6TZKiVwzaKlIhtlWNYkVH" +
    "Y21ewLNQON1v4mbtLE54M+GHpRPoKSIZrQM5MrHXTI8+gCMPRsA9ZiLMTjQIQVFcPekpJ69jhMVN0fqeGQBhrmdmQC0b3t6W" +
    "Wrb0Ahq26WWXr2ss72jkVhVQQPx0jfuDJnTWAe/NgQ4TREQOiiGBBM3B7txlghSk0HjnuTobkVDKalUWKjwaJCTI7CljgkqO" +
    "+2a/Wja4XhvSr55epumNwY6eNWj4x09E972w8PdPz7nz+QXPLlu1spF35AVU4fTay/hdKrIlTlYZnscRbAmODQ2e7KOcWgNB" +
    "iRhCwk4QRBMiapT6f8wKZQgIZFhISu5ThyViEiUCNEitOoyvm0qHg9MpSIiUxJjMSLuRcYMH7jl25BsnTXjT5In9a5kDtfWU" +
    "F1W/gYnojufm3/zUnPtfeHn24mUr80ahZOEGXjzJucANoZQzByiZ2cs5CsMEZUfWzf6eI7JwiZdJUPUDxOUeKQlXQYB64kEh" +
    "Aik5ikm4m8PkWT+ISNjLi7kPABZOpxlrLIPa6hMHD9xv662Omzzh0NeNa7KWLdGgw6P94+wXvnzPo3fOeQm1OqklLUqfSV7A" +
    "wvEYRzKsqGDvLTwdYSshuZTyO7ohEkS2da4Sj5UQZ/YzgqljiboQAd0btUA9dC6OWjHixAuJgakxMGVw/7P32ek9e0xur2U9" +
    "4mzCsXbNP5757oxZd819ibIa2YK0IOvV5uMwYkJIgFTcisM8ITMjzNtwlPssx/qSIzRqOwl7MWU0nZyIXFepAhGnENty8sqz" +
    "epVbhqWczGFhY8hk1OjYf9yoDx+wy4lTt+18nm8pBu0e6tK1Hf91ywM//cczxCRFw4gBE6yqv95IA+XmPsL3OBlGTe4xUzKY" +
    "SokWROUbSXwRd0A6GxKVjUr+5+RMDVsFlQeJVBs0EckVEYKlnJnrbdOGD7z0yH2nTxzTTZt2vz57yYpz/nDfH+cuBDTL85Lx" +
    "XP10KcWLdgwFCQ8l/CcMZGeBgBpVcZv4EiGWiJoKpeWWjp+9bUd9BU6fUCXaapKnRFTb4UR4nIRYmaxkxHzk1qO//cb9J40Y" +
    "0oPhR88YtNtkT7689OTr/vyPlWtrea6kam0Q2Qaa2Lc4GVCL7KA+UI4Tqj7a5i4Z66rzxhS12qsD2/CEY0zp/5TWD0CMISYU" +
    "FlURgjD9GQ6CcIQIszGcs6kLXXz4PmftvdMmPxX3i398au7pv73z5VxrRQ4mWxTJZmWqkA8nd8ALOsSQGdEFBB7eiiWHE4u5" +
    "SdcpfTBRjkyxPsKFMN8TR4zjFuIQYlPVbYEoM8IseVYbU5erTjj44G3H9ZRN94BBu0jjby++fOzVtyxc16iTFkpQJU+mEpML" +
    "piZmM/byKlFysyJySEFPGVzhFfC2GxXGEYQOK2Pe4bmlYpJIh8ArQUfyahzOCa4872hSzEZEoVrr97kDdv7kG/bYhKfifuV3" +
    "s54/8dd35IWtQ0s4fRgVS02UONHb5eh9Oej3pGM18ZYhRLhJeJIq8TXFbOyP0KAgWb329DBNYkWu6AZVNmI8FygM1NZqpkOp" +
    "Pct+duz0f99pux6xaemBPIb55dVrT7zuTwvXNepkCxBpkRKpIKWRh6eXC0NNCBeecFZ5pSrmwPnOKfE0VSZYKYmAo6S1/y+Q" +
    "ngNVHaP4wQLJLaUuufJTnMr9MBOg1jIoyzsuvO/xK2Y+aZjtK3EQChjmvy9Y/M4b7izyPCObq1Il3K1oSPtRqIqQOifnSZVw" +
    "Fezl9iI1R0mgSUHWniKLdNBgd5PhFJXY0zfpit6Vq0cnBxI+dMkWXgZ9jdzWiNbl+Wm/veuxhUsMs3bbvUoPNE2A999019x1" +
    "eZ1soQRbVES+/VnPXko3piAcjZzCFDYnfjMQw3HVhVTMTBNOeP+BKIbGiZNgaj4jElkM/8wDzz0nWy6coej0/q52lhWNc265" +
    "f8a8RRv/VNwPrWzkp17/51WFzYjUWk6jCb8lERJVTxLiRs0RZ8krFtVEIlytx3lPEV/Kv0spD4Ykz+b1RRpVV07xfnNC54cg" +
    "PhE/CRCsAkywtjDQNaDTf3372rzYSDap3jJoCxjhKx956vrnF9ZtwyqRWs8bWzl0gpQpV1j+mdJiUqKBF4arQU0Dmc1xElMa" +
    "UPjnlvBxRDk3//Sc+4llZk5O8fILTZWETjUGPw4axL6s7SD5wM13FRtNvexCtc/ePvMfqxo1LTTSInCYJS+1TJNMgRPJmvJU" +
    "YTRlfpU4oOt9VCWFAlKl2eSNOrNJchdeGkFQHan8BUed0ZRFF0B5dLgrtKo1mz+8fN3n75wp3XbS3ZIvEaKVHY3P3T5DilwB" +
    "qE3r7WEnsmfOaYquoi4VVYLeEP1x01GWGlbqh7rQwqhoFaUpDjfxcKZeyskLi4lbJhGcq6hroMkRwqpmeccDi1b+4em5shGB" +
    "hws25q1cc/nMJ6TRYcusoyTBaXrxJM9qTpCdcXD1m5ykBVHVJjXiiigIJXF5JzXpshSEDVNfJ1lnKVUasuiIe2gKiSJbFVmQ" +
    "5B2XPvD488tWdTPwkG64Z2Xm6/7xzDNrC1MU1lq/6ziN+yo8FYhE3yGBY6qKf6OJEC40pdJsrnOlqPS6PnQjdLUTgkcNuWJy" +
    "exlEsNZvS0aTLwyeJ3HViCG+I1rSb933GDZCYtY9sx/OnLWKs4wRXgeVeIbTGD+6w4StKAmUuJrYIX0BJL6UE5Pn5vCWQ9QV" +
    "pEq5U4mps+gICNFplazukSsQoaEYSf5Q8UdQI1id1X/08Kxwcza7aBAzEV37+LPSJTtr6jaDcTNTRRO9+uCDCGd0CaAkRQJ1" +
    "ffiFE9mfDBw7WEkNI9AWczXfQizgeq66SK8fDsyo3OSjwOQDgojIEqTIb39u3pOLlm346ASQiXQU9uePPEVFXlhLasPBXNYg" +
    "Qqyb2ijSEAnpKRRCZI7ivF5AIbSyE3bM8lJReVJlbzBxSFVQGXdyJFwBL/i6UUkolZ67nNY8vRBqIjisyiiK3zz5bKFqWDa3" +
    "QTtswNJ1HQ/Pfxl5XlaOQ90LsarASemhqVXHHkWBpFxduUPBqEJmmbQSwoYIslAhMEtIvgKZILgzOQqSoxyh/MUUtUnS2qLT" +
    "5qbo2ZP80b1wZtjW225/dt6G3Yz7h8cWLn1m+SpRG2tvqJSbkaZwyf1IizYB34Kq1XOnkICa9MnTMDxxLlzVUUbcQrzBhI2D" +
    "kHjMXKKuapoaBABh5RBVwNjiycUrn1y0rOQv3pwG7d5v5rxFL+cq8OCgJI2ryBBzxZeF4mdoyHJyRFYfTCxZoPJNL5ydlKA7" +
    "ZysoY4QAHqnc0NBcDyWt5MNz1NpplgQJLguJ8CIxlUARInrgxZc3PN9f3r0FizSrBUoxVCMF9rsrxAUMjv+ElJ8gCUbYOxXm" +
    "0IaNnfsmo0zuHTfJ8YW8OLmvHFOS6By4S0GAWCaiBCqTNN7TPeb3q2HJs/rM+Yu7E3VId1Q3n16ygkwmKZFwF7k2VVsBsUbg" +
    "tykIqOrNNkVsXA2DO8WY3PTf0Jn13SpfY41ZeEU9sHTknGCUuFlWkKoUuYmkBFOgiwWEVJ9dtjKEZBtYT7y8lIhEogY4OKJO" +
    "qreUk0yCEHUr02J8gKB08Rw610C6eFSJWwhHrtc1CogYJEXV6hWmtzkRkWk6cFHRQSuJHomJVFlAzI8vXNpnZbvFa9Y62BtV" +
    "GyicHGkp4IKraI1484AYTnFTLs/VX2vOGwPKK+kFJtE5p5eZeJ0EuYrmiAihGl0NYCtlM4TzOhQKhSFEhMVr1jrg63oFgYiJ" +
    "aN7ylVDHnhw9MPuSkN9/4Kj7zjFp5KZKfwyQ41EJ+BqIO6qQSmBw1dqRdleaCZEZlbdLeU2lEgj6H65acOzGVrkhk/YXiKXE" +
    "MM1btaY7FLXdMuhVjaIUJg0b2feZmpMHRKHFrrwDONGsSY9gDn0uTjOVEDYAyX7hJncT42yAm2p2HB4epxW9ZDNx6J3FAnfl" +
    "DOHmbhk7FGuuG8Vi3mGr+o1pPbzyJ3SqE3KTPq4zvSZ4EHPgdw8pChI3nyoLVYut5CN1xJixPIKYkzirkvb4dK+sMccefQim" +
    "wjb1KFVOqk6homf7qg5NRO2ZIeGUmhNUDSyrzdvQWk0KlxGAy1QV/05sOkGPJVFC2kPhEAgwqjZdQqURnlPJEc1UhaQmiTq6" +
    "7JFx1UlX91cpVE5EzP1qWbZhB8NERIP7tbGYpjAgifc7RfYhrU3rDkHHPjlxYh0jHhQRIcMAV8Cn3g2l+K2kNhg3fYrz9XAE" +
    "Zq5mfk7NIkh1gDvFNRyvJM4IBCMaVK9RN6bOumXQEwYPINcOSM7mppZTpapamUfh6PfSIYgEjpPoNXFA2HBlh3CCSECzFaZq" +
    "a74syKnMApqqgaH32+nlmCt1wNRpJ2cpExGbsYMGujx9feem+zhjBrYTCxtKBgxQMeREmTMpKVbgEUkAjiawKGLhvJJgoyq+" +
    "FWEeVFacQq0vBkMJKTShSSoYXD0yEml6inXS2DYMnaOA9yAmglVYIuaxg/r3gYd2Fzt5+BDKc2uVJIjhcQRIJCYZH1Twsl4d" +
    "InW35YBK2nMuDQlIa9IxckZSwm6GylRqYRUV2RLGH3ihfRzPZdmOO4UUIITn2qldF095IRaZMnzwxuTpO44cWkLtS9ZvB65n" +
    "+KiNO3sIUFrY5CRa4WoBJ+0u+Si1+lyabh83ZaBemaAMujz2otR5TOv7CdIhEQHhTrK27GuOKYCkCXpA0O2HD+4Dg3aPYOcx" +
    "w0e31205kxBrC2mLE1VP65t5znDLex9SBK70sIJdIUSwznE4iSaE+lVM3IAUW8OdxlyIws9z+Ry6ONyC1FOKamBCJyy3V7so" +
    "I00mMKndd/yojelJ7TtudJY3rEUSjQFU6fsgaaH6NCqt8lZS3+QjhuYUuijqRIdN1US8GhuE4DhBVVcVV2LCztUMO2m8p0XJ" +
    "ahkmBEZUDk4UqnXb2HvcqI2pEfW4hyYLDGtvO3ibcVKrS3LyhqoDJ86ME9W0gB7jRFGGI3Qzabx4gBtidBBrS8HXc9LQqdzI" +
    "SmWJQ7AfBrBChyJ4tPRRo1KCjRF40ntGGjoJSw4MYj38deM3/Ejc7N5Oo4fuudUIZDVD4is9JV4/xUJxJxEkXm9htMsn5Tdw" +
    "5dwqG/+cYmqpYu++Q1aByVQ8Temvm8KfynNPL8LH6E0OxEkoQISpXt9t9PDJwwdj8xt0WP+x+2SUo6fhyrVa/QG60OTlcKKV" +
    "UVgsRVdbor6twkk3tzKcVfWqSQk5IqHDxgnVAFQqH+jUEShV3LzMVaU3X2k5JE1DQ4x62xu3n7jVwHaruuFH4n7gtGlTYDK/" +
    "vZHMAqb1bq6eHX5vcSUCDr6EqWu8SxTE8tF1YnGcjvGwh/qmpYy0OA/EOxtTYjTvqtCWCnXQtIWcHHUop2yNecfOk4TZdkMm" +
    "edMN2jCD6KjtJ+w1fJA1NWMM+55nCd9PCwlMafbs3a5HKqIr0Wsk+oDV06tSte4SXpOkKGEWJqkTBBEsDjE6h8mYJJ5oUsBO" +
    "i6mITxXEIkaUyRT5BQfstiE17XD3RACcssuksRlZk5ksQ7UQR1VrrmKtYk8nBWk2tTCqHyLtqDJik7/5g7oKNjcfTanhonpj" +
    "wv1kX1mhppJ93AFAmmKFwoswF2y2MnT6tCkAjEjflO0UyES+eMR+BHX63ZTW2kKEVCmkchXUggQzkNpKWqWgFBiQ/gnVpD5J" +
    "u+PTS5w9OJlGQXNTtxxZRpyj6UzREA7nJAsSw8yGqai1nb7zdvuMG7kxY8xOnmhIv/pnDtkTpsbQprvTlOpW7ToF3qa7P+Rw" +
    "hK7w/tTVhHwykImmfIITRAdXUr9q+ce1bBiVGa9OZx5X5LYCrh1EMMIQ8/lD9hre3qYbgVXsLYM2zFZx+Hbjz997StHWXjMm" +
    "MI9UTium5sQ8gMGTPrNH2iHt20VVx9gYR4rp5AQVDzTDpiseKKmYcDpmzjGiR8q9VTUm5mYRrbDbDFGDzLb9zBf/bV+tCm/+" +
    "i7sHnLnnjkdPGJ7X2+vGOAlebgqKUYnfErfAlBaUYxbYHKg0NRapeUo+MHt0zbLC0QWgMrIWmwAVsAxiERJVfG7syjCis6oZ" +
    "yWvtx2895ow9d+z+WGF3Y2gHZv/SEQccNX5YR70tyziFHaMC5K14WU4nsdE8JBI7z+mtjZKulCKKYr2UOrcoq64kIfqI7Dbe" +
    "93BzzElOTDj90OUMLqLNC6gBGlIzvzrpsFH9+72iDN1lhz854dDdh7Q3snrdZJwUZSIc0Huy2CXxzhvN4WZz1zOpFVdKSd68" +
    "uIr2DRlxaLdzJdKh9PxF5KPwgsvlbBV3np+otn38W9UMd2RtOwyoX3HCwT1C2SPd1x4WZsP0q5OOOGLc8LzeP/P6MHFOr3TD" +
    "Dlrgj1GEwl0Kr4nlvQoEqTLtFOlhAug+Nsco7S+EulUp1M0pHUAYioVW+hrrMRA2RsSIZGzEh7BSM5yLDKhl15902J7jRtlX" +
    "+EicgY7o33bjO96469CBHVktIxhjynyUYkWZKwmr31GI2OigV47OwtABgUdVMIvvRrvnwuHplNWW+NMI5ErETYkEfLAUxtK4" +
    "ueifum2kINWMOa/123Fw/xvfcaTjWOMthJfD7a2Owr7nxjt/8c8XqWjUVBUpxVys2qGrpAlUHcOPWN0gjJlWQrynpCaWgSZY" +
    "EneetEDK2eL5x5LWTXqwMvkPzEScZRQaQoAwF6rUPmDq4LYrjjlw/25wzVhVI/Ly6rVn3XzPDc/Mp0ZHjeCY7BImJwY1zVim" +
    "Rwoj+ajUiYAn1kZK1jlOp1Ujf0nT5EpsrcfSfMqm0lTFrmyXTol++BXDLMwNEPdrP2L8yJ8ed9BWg/r3FKNajzEnhXt35SNP" +
    "fe6uh59Z1aCiIbbIRFSbwJCIHGCxQtk5HSmhktUoAk0PrVIUbN4oXC0cNBEQdR4ahYPGsFBJolfWQkyKxFGgAFGtrR3F+/ae" +
    "+uk37DGord5NPqvwOH8wc9bn7pz5YkeBwhotJOGgBBBG3GNQpOSVXblrooH06XDCWlUdeyf1CrGdK6IpMxOXwJuQICedP1Fo" +
    "5EhA1/GfQq3JKKuNa5OPv37aB/aeysw9yA/Yk9x2LjYS5uXrOn7w0D9//ujTjy5cQvV+TjGPUQXhcYLzLoktK94llouaUM6o" +
    "zrV62F06MVMZAq/A1LgL9qWkgeZfvIpY5STzZKaiGN9eO26Hbd+/99SdRw8LLrb7HsHdgUVr1v3woVk/feTpWUtWIKsRoQLV" +
    "QKLyTKgEuWmbB13ObHcBjY6oxk79/C5IozwWtdOT9GPNJRCK04EaH7ILCVPe2GXEoLfvsv2Ze+wwekB7letmi6TTDSevVX34" +
    "pSW3Pzf/8ZeXvLRq7ZqOwvk8KIiDA2R4QWkKDWBhN0fNYOc2DAtImQSsChIWVSUWdoSiaoldHUyYhKU8reP9VA3chGBhBx1S" +
    "y8IkIixQjWRWxCQEgNSTfogISyY8ol/b1FHD9p8wes+xI4a39/PUtz1JqBvuXkdhZy5YfP8LLz360pKFq9ettY5hFXBnh0PE" +
    "s1M7dpBCz/UJMEsMqaHu+0BJ3FpSqoaMXUiYiUWtumt1OJTwu0wEtSRCAEF84gQRgcISmFlYmEiZrFVSYmG1CnGQWktE/Wv1" +
    "cUMG7Dxq2L7jR+07fnTNSC8x6vYKPzT8mD69dpeD8PcGHTmIrGomr2W1kELViPSGffQig7+LQLSC2KTNL4PQpbxxSmb+L38X" +
    "CVG4+0Xp/SsqvS5t1N37l9dCnoe8my+yaXc+oqV6mb6/JY3cWtRSwWqt1moZdGu1VsugW6u1WgbdWi2Dbq3Wahl0a7VWy6Bb" +
    "q7VaBt1ardUy6NZqGXRrtdarfmWb881QncIsKQxe0ximTpdMr/nrbcJTbOZL7nUsBwAFADLSNczGWnUo6t5BX/XBUi3ljDNj" +
    "aD0jKgCMvHbwiKpQgImM6frML6wtUab8qjVoVYAqHAur1nQsWb56bUdBRLXMDBrQNmLoAElAbW5y4dXrwxyNbrozl69cu2zl" +
    "2nWNXBVttWzYkP7DBvdPNzOt3wheFf5YgdRMASxetnrF6o6ORgFC/3714UP6Dx7Qb7Ndcu/goUGq6j70spVr7/jbU3+5/58z" +
    "Hn9+zotLFi9bmRdgIREZ2L9tq5GDp2wz5qC9t/+3A6buNGmrdMbu1WvKcxcsvWvm7LtmPD3j8TkvLFi8bMW6orAATMZDB/ef" +
    "MGb4HlMnHrzPlEP2mTJu9JAut8GrYlmrwS5nPffSn++bdeff/vn47PkLFq1YuaZR5AWI6rVs+JABY0cN3XuXrQ/ZZ/JBe20/" +
    "dlTvXnIvTKz46/z7rBd+dP29v7nt73MXriBmggUswQozMau6CQshESKuG52+x/anH7//O4/dNzOiildRuBl24F0zZ1/y8z/f" +
    "es+Ty1c3iJmgBEuk7kJUQczMmRtnGjqgfvTBu77npAMP3mfyq2sbu8RAhAtrf37jgz//3QP3PjR7be6G723JXRjmjlmIDbEQ" +
    "MHxg23GH7XbGia8/cM9JvXTJPWzQ7iO+tHjFp75z009+fU/DMmmeZSLCULWKhN2FQCQEIhHDeVEoZUw8bcfxHz/zjScftWeT" +
    "D9jCH+39jz570eW33HT7I2AhzWuZIWFYC4ifmyKAhB0VhxBRbi1LBqvHH77bp84+Zo+pE18V2zg8lF//6eGLvv+HmU/OIwKj" +
    "KE2zpC1RiqKLYCYWIaXcWuIawZ5w+O6fP/e4nSaN7fFL7rmpbz8h+9u//P3cL/xqzsIVgo7MZIW1RKSBsijhmkNVQ1aYhSlX" +
    "JjZvP2rad/7nbcMGD9iS/ZYq3KH5lSv+eOF3fpdbMlQIs0UUw0jZFSNzvuN+EgiLQpWythp/+v3HfuzMI9OX3WLPokVLV57/" +
    "5V/94uYZAOqGoLCo8AFWaTDBflpXpCSjsWQG9jOfO+f48049rGcvuWcMGoAqjJGLLr/5wktvIlCtTrbQqCEdOBrB6fB8JDKg" +
    "UrHRCDFLQ80u24286qvv3mXyuC3Tpt0zWLWm44z/ufJXtz4iXBjmQi2xOPbJZulsTkWrEKTThK1hKVTBbScettOPv3D6wP79" +
    "tkybdg/i4SfnvuOCK2bNWZpxQUChHBVuEFS8OHBVpfQKTMSsxCQsVi2odtqb9778M/9Rr2U9dck9YNAu1TUi5150zbevuacm" +
    "BeAmiDkS9Vdo/FIiEqf4XSpv+nl4yow0Cgwb0O/G731g+h6TtrTYw939JctXv/n937330Tk1VgtHKVySDHlvnB5CCZ9tQt/E" +
    "pMQkJMKUq0zfbesbvnP2iKEDtzSbLgqbZeaOB/95/DnfXbGqUa9xnlvEYfqEY5oTGsGKQDrcFL/nZkLGnJM5dK/t/u+Ss4YM" +
    "bHfBW98bdGFtZswFX73uGz+7q26sdYVlSjW8gyAZpbwuXsEq8K5yqWIGcqxnuWLkkIG3//T8nSaN23IesGMeW9fIj3z3Jfc8" +
    "MqdubCPXcnO6/wucnKkqDyL5RaqMRol3q2fUKOSA3bb5/ffPGdi/bcuJp93Nf+jxOYe96+Jlq9fUhApbXhNFjkKODPDM6W6O" +
    "BLscdPPKXZ5lnFs5dK/X/fGKDzGRSHeLttL9Yygz5of/d9fXr7yzbgprraakwImkJKectFE7rUlvpmT0Z2YL1AwvWr76xPMu" +
    "W7J8daj19P3ThYrwuy+88p5H5rZlNs8R1Lc48I0B3JxgRDpE5iiznRIz5gXVM7330blnfPInIqxbxvyyqhLRy0tWnvSh7y9b" +
    "taYmVGjCzNtEaMyJNhRX9Mk5MsXGeDsvUDf6lxnPffhL1xoj3b9k6ebGNSJ/n/XCBz9/TcbWcaEAgkRiJtFuipoTCDq+qRxZ" +
    "NeiEcmFRz3jW3GXv/dTPRbaIAXVr1Yh8/9o7r/rjI3VTdDQUXq6lJFAFmijKuUIWl1KCV/ls2T1gW+fi+r88/r2r7zAi3eGy" +
    "78ETSYTfc+FPn523vC3jwqLJDyV2W2HyLo+joGYfBISrfE55oTXWb19z91U3PWBEXOelzzy0Ks656JoOC2ZWrI9sq5kj3kl8" +
    "MJLApFmxxt0CLqytUeP6Pz168x2PGdPHD1gVIvLS4hWf/NYNGdnCepU9v3dLP81MzeLyFRVN7kINPQi8SAEYKj558Q0vLFgq" +
    "LH17LllVY+SmOx694fYnalLk1nIICquMxkxewonSKg8nyrLgKLRU+WUFmPTDX/6/l5esEuHuOC7pTugswlff/OBdf59TY01N" +
    "rdSlY44M2OWhHETsEtbuJmGOcHMc/66y44T55MW/buSFsPShn3b9gs9893dLVjSEyBGORR3ZoNdV5bRN2VE9rXVF9DaIG5UP" +
    "WkmIlq3OP/Pd31VYbfuiys5E6zryj3/jehFoqTuRSq83eSsfelXlg5OiQPKfhKtbgYz5peUdX//JrczskDCbXWNFjLX6jZ/e" +
    "xmSjwgOiJppnEixpWIP4LifSdGUayJxw3XIiTsxEbJUzxt9nL7zujzOYyfaRx3Lx1dNzFv74+nsM2wJKQSwVQTw4iBYwqtI4" +
    "VbdTajxwzP8TEddSUij/5U0PzJ77spE+c9JWVUSu++OMfzyzyJBaLcW9S21jijWbznKxCZV92ktDKksXMwrAAqz5j66/e/Gy" +
    "VU6AZrMatLXKTHc/NHvmEy8IYtgTFLwSBkz/2BE0hVKqfXAU1St17ypiHxwjle9ffSd6jnd1ExhviejKG+5bZ8WYcJWJmFRF" +
    "Da4aRHFF0j3IyiHWpIPaHDmKyIxlbc4/+c29G6Ph2UvLnYc/uPavXIqKchQWb2L6CuFDRUDd7dugg41USSR9CRCpqjAWLe/4" +
    "v1seItp0t7WpHpqJiK666QGwMEsnwXVGopqWqIGgWVq3k5Zy8M1I3qtQK5rf/8jzj8+eL8Kb32MByIzkhb3+lpmsuVqNrRKU" +
    "HovXq34FxIo7VWWPUumGUjjTndIWSrC/+dPDhVXTFwmxK9U99tS8+x55jil3hXauhk3+uirPEYmIe5NVNGtHeT2HlN77uj8+" +
    "uLmFN53wViMv/vLALIZFwleeatmEqDLqRyDpDCbCa4Hb2asrVKI090NGTA6+9Z7H+8RjuTd8fPb8Wc8vFIFFVO7qHOXCi9hW" +
    "xDXY0SVGacouXFwQ1yFWkLCd9exLT8ye79OwPjiRbr3n8ZyMMaaiUhgIpaNibFVFMcraVnQH4B9wUGVJAxRVsOb3PfzsnPlL" +
    "NtltySY/3dlzFz07dwkzwhuXpYtSHJ2bilbsJQ0iHXxyk7ycdlA7TuQSkjt2/yPPdC20vVme7ozHnrdkhCUyi/v2X/pggnID" +
    "U7MGKHe23ySpiLAPIiI2bArI/Y8+2yd72H2iBx95rszaKsluKuHuXVeiS4ZUCdKXcThOr8T4jFOZTiJhXtWhDz76XFUbpLcN" +
    "mkBEf39ybg42YkpxTa4ImSCRJffFjaRDFIvS0aw5VOmrJLhJD0Kfe3EJ9Q4r88YQ7D/85NyoigFXhGKgWS8wgVxF4WBuFgWk" +
    "ikwJglCVby0RSIhYHnnyxT4JoI0RAE/NWUhkS/3cZgn3Ulo16DelcqXw3QZUtPnYn1VeZ7oiLsIiQixPPLOg6sg2i4d+bt5i" +
    "CnNTZcXRXxFzElN5LTQv9ZzqRyYauomgWKlaFoSwXGdJoTrvpWWr13b8S6rj3kiPiOj5eUsA9UInQcY6Cn1WpLkBCqkgc3PK" +
    "AJ87sY/P0GT6gLVQO2fe4s2/h93tXbFq7fxFy71gCNKHlMImvOutKIBSV4IYjKhVFGQrUsEcdzPnLli6yefwppftVq5eR82a" +
    "oUBSf+Tq3UlOsqYqbBcSpZwmHUzMZZFs5ap17n2JePMSpxMRLV6+KkqtOafiStOlbDngI0dGk3J4p+vjJgXo0qVxWtFlIcLC" +
    "pas2f5TlntiylWuXr1jLIeAp1SOBptMnkcwpEZVAp88MBJFVNCuBVpSCmZYsW9UHdehGw8Y4sdLMrRhoWqckRSXYQEWJkFJp" +
    "w3QvIASqKKzmhe1BovlXxEe/Zk0DSEKMKNHFqbptKkPrPZo2RYSJWpqXOkYF5ACUWI51jUZnQvzNs9Z15HluS6HR6t1IBdhB" +
    "QR6cq3rXUQI5uUGdhRQZ1eMrt+uV8+pFg1ZVbuqiJfLBiU5vs6wYpwPuQYQPnXuGiRib3/NZZtwodZ884FrNpGLkSNQTAx4D" +
    "UYUWVJHzoorONip6uMlJVbaZ3JgHM7e3tW3+DVwahzAzkuJEWbwBEjx/oqRaJhQpzANpxSNIUINDYyJxZOxHgOqG+8BDjx45" +
    "2FcmlFm5s7a2bwuhCgNGRTKSkSiepGq+PtiIIC1iM6B/2+CB7bTJ+7d7M7Ajhgx0wlMiyhEjyqEnxFXJe+5abTvSVaCLwh0S" +
    "BVAmMsOH9N/kDKmbIdbgAe0D2mtINEzL3lhF+BNNnohT98roSo8zimPHvIvKyg4Rjxg2aJODStnkq91m7AgiV7NDUmfkKO4c" +
    "xaWRjmlxkNeLcEMXRHJTzwXJLRImYhoxbED/frXN76EdumCbcSOIhYyJNSxO+qNJ9Y191lcNizsBSql5A/hcqRTXIcKoYYM2" +
    "uYbVzTV86ICRwwYRC7MkZRkk8Dog3ZagJqXgAEP0FduArq3WP0K9S8FMkyaO3KxVDvf4Jk0cyWpVrRtASBTJq0aZIIGJu4Ai" +
    "VVuGiTx1WSoqSx5imFkmbz2amfsCc8dEtPOUsSH7TSrtSFre1FTDY3dnYnshBiac+OEKytTX6Z284E7bb9UXHppVUcvMdluP" +
    "JjZ+x4IiBIv9paCT/nEqt05Bw50rasqU+MFQBoCqhdqdth+7Wasc7p2mTho7ftQQS1I2GqrhMic9s8RrU6JHXbbzA34jxWRV" +
    "cD7eqRPxAdNet/mfbri0PaduTVqoLeMNKhXrQonWRfrJEcyhxh4QkxVVc07+UDmdQCywtiAtDpg2aXPXdJJe0r67becYj7yh" +
    "xnPFnyREVHHM8JrWTSaDAN1plqYN4GnJlQa1Z9N2nEibKjC7aQbNVnVg/7ZD9psiUjOmZDuqIiRDchhoGnyNkn0iQSGXSAIv" +
    "BgdYQ+jXMNuiMFQcvv/UPmmsuHL7tB0nbjN2aKH+A3DT2EloE1S6gOzP3CqCOMEmdokaJy4UU7YeuffO2/QJDY17vyNfvxNp" +
    "YdUitozYw604ZP+VzAjoAlnK4R/9Iy2Db4QejRCzqe29y7bjRg/d5Im7bgH83370PoCqRed4guMsEmJdmfzsUUC1J5URfyqV" +
    "FZ5YEWE2TEqy+w7jd50yAeiD4UJmLqz2b68fd+juzJmrEAeUKCeBMgLAyKf/qJh9FPCkEFBSCi0sH7MhIsqOP2xaWz0rrHJf" +
    "7GEA++yyzc6vG21JjITDB14X3WN2PDqyqS3a9S7hGI74J46yog8QyduP3qc7rX7Z1M4ZAzjigKlTtxlpKZOkpxfHfX35ODlU" +
    "QpO0CYrGTdiGFBpNBCYl4ve97WAR7quhFXeN73nrQTUhq+pCjZA3oILV50o4wV3jN/wdSs5WX98QIQvtl+E/3zK9j1r97hxG" +
    "vZad+dYDiUREuISdlbUnpJ2ymOSzn5ZFJ4S0r84hRuAxwhJSMqOGtJ105J5EZIQ3q0G7qKNey8477XAwC1czxtjUjp2CsoQZ" +
    "ShoBouEB7okyL5IKPIRRqEwaN+yUY/ZzQL++MWhha3WXyeP//fBpyjUhqYSBTV1cfyJz6XgqWNo0yA7do/SwzpgtmVOP23/q" +
    "pLFWta/G3R1s9fQTpm81rF+hDoleNgK7rIvHwpU/vCpttQDtL4/msMuZCUYEkp311oOGDxlgddNPpE03jswYVfznCQfsMWVM" +
    "DjYJ6CiOk1HTNg1NJ06b5KHu5ZB6aaGECcIClq985KT+7XVFX/JJOwzJ588/flB7hmrSUk3hkTBDNdVxENw2c9WFJ5dsgSED" +
    "ahe+/83AJuZGPVbrAIYN7n/h2ceCa0biRFgTeCE9q1CWLJHmiJycXYG/w31TGIbJAuNHtH/o9MO7OcMh3YSw1GvZJZ94m6Nt" +
    "K/dk6AEjrVNwaPCC4igLhy5jU5jpj+kskxzmpMN2ecsRe/Q5hZID6U6aOOozHzjGIsvEVMFllMRWseTKCZqDk9Fn75wioNo9" +
    "8EwyS7XPn3vcxK2GOcqEvrxkZmv1vSe/Yfqu4xrKmYQSfEpjEOp0KXbBhZvN0QWHRDmFyYsozMUfP2n4kAHd9FnSTYShVX39" +
    "npO+cO6xBcQY4TLkLaczYnED/iAOiR53autzbAs7267VpFHwlK1HXPaZU1XRh76qEnionnfq4W+avn0DUq+xMMLuDROkTZli" +
    "BRVNgT8qVgfCPEfNcIfyCYdM/cAph1lV6WuiGdftNkZ++sUzRw1pz5VNnFApEc2VLAAJJiO4LkRMVxXNRkxUy0wO84G3HXDi" +
    "kXt132dJt8MsKax+/D1vOv3NezW0VssEEd5cmTnhShW9U+PLBxq+IEZGuJFjxJD2X19y1oihA7cQBuUA9/z5V8/cfdKojkJq" +
    "mTBreIxI4M4JyqVSvuIEjJUi+jMjHcrTdxv/sy+dqeqIxLeMPWx10tajr/3me+s1YwFTrc2VzioUr1ABXvmJSU6hpSHarIl0" +
    "FObI/Sdf/Il39MgGlh5JHVTxg8+cevLhOzfUZCLscz74aSQ/eIMwMcpcVp+RQg/9KZUZKZSGDux3w6VnT92uLxOj9dWzhg3u" +
    "//vLz502eWyHzWqZEGsozbC32EoEjOpofwqUBwlTZqSBbP9dt77xe+cO6N/WJ4M5GziKC2sP3meHq796JrPkoEy4CaUAriIS" +
    "0sM6kifFqxKCMaYD5pC9t73um+8V4R7ZwNJDpxIZ4au//u7z3nFgAVbAlV3ciH+IGsvcn5pRaG7IjKBEMIyMNVeZuu3ov/z4" +
    "/Ol7TNoC2Ued0xo7asitPzzvqOlTOooaExsJmT0lLAXxJlXaLklMKUwAGsonHLLjHy4/d/iQAVsg+2hmTGHtCUfsefNl52w1" +
    "YmhOUjciEiatYvsTjNj9DcEVKlyKmYgCBeTUo6fdfNm5gwb0i4D/LYcf2j23H11/90e//pslKzsEuTAroB5DyClgoZxkikNI" +
    "mQiR5paJ+JSj9/zWf799xNCBWzLnuTM7AJ+/7Pef/d5NBSjjQogLeE5kigVK5mQyjQlgYXLs5wVMXfDpDx7zifce/argh549" +
    "Z+F7/vfnt894hlDUjaiqElRDPBUwaPGRu00sDCG2pKDawDb+3HnHnXfqEVsiP3QTr+5zLy6+8NIbf3nTg5CMNM8YxIJyPtYB" +
    "ayOfjjtmcpuDa0Sy83aj/vfsY9561N6vEgb/ckz7rplP/8+3brhjxtPMhlFkxnhMkiZ1LYG/XmIpigJSY7VHHTj1s+cev/cu" +
    "276KGPxV9du/vP1bP/vzs/OXkRaGIR4/C6iChLXsA4NKNAi0UEDqhPzEI6Z99pw3O1LZLZTBv7PgyP2PPHv5dX/97V/+vnhF" +
    "h0cuKIFEHBGe28dCJAAM2QOmTXrXW6afcuy+/dpqr1KNlVvveeKya+74w13/WNsgYiK1hIKZRARq1YGXxLgTeWCbHHngLh84" +
    "5ZDD9tvx1aWxEhzqilXrrvztfT/99d1/e3wOS81xtxHUCIgZUFWXRRtiAWFY/9qbDt71nHceuv/u2706NFY6S0ItWLTijgf/" +
    "eeffnnrg0Wfmzl+ydPm63BYgzoT796+PGTZ4x+22ev2ek446cJfdd5zQWV6JXj0qWGEHPj3n5Vvvefy2e594cvb8eS8vWb5q" +
    "nbvP9cwMHdx/4tgRU7fb6uB9phy+/9TXTRgZCKdffSpYiTne9/dnbrnnifseevqJ2QvmL17a0bDuXrTVs6GD+m87duRuO054" +
    "wz5TDtlnyvgxQ19lKlgb0ClcumLNoqUrV65eZy0GtNeHDu4/ctjAei17zegUWqucKIhaqwuXrFi8bHVHo8iM9G+vjxg6cPiQ" +
    "AZVbBLyqdQodQXj4ztp1jQWLlq9YtS4vbJaZwQP6jRg6cMig9vXdolejkiwpFMD6ZFWdCOlrTkl2Q7KqTklWWF4bl+wUdjYg" +
    "B+zs3hF8voqVZGn9wtduiPA1r/Xd58LXfahtns6Jvqa0vlurtTbnktYtaK2WQbdWa7UMurVaq2XQrdVaLYNurZZBt1ZrtQy6" +
    "tVqrZdCt1Votg26t1moZdGv9f7j+H9f0dKX1rPSmAAAAAElFTkSuQmCC",
};
/** Ruizmier Group. Origen: `public/logo-claro.png`, 280x60. */
export const LOGO_RUIZMIER: LogoCorreo = {
  cid: "logo-ruizmier",
  nombre: "logo-ruizmier.png",
  alt: "Ruizmier Group",
  anchoCss: 140,
  altoCss: 30,
  base64:
    "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",
};

/** Los dos logos, en el orden en que aparecen en el correo. */
export const LOGOS_CORREO: LogoCorreo[] = [LOGO_EMS, LOGO_RUIZMIER];
